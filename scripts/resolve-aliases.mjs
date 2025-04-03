// scripts/resolve-aliases.mjs
import fsPromises from 'fs/promises';
import fs from 'fs';
import path from 'path';
import { createMatchPath, loadConfig } from 'tsconfig-paths';

const CWD = process.cwd();
const DIST_DIR = path.resolve(CWD, 'dist');

let matchPath; // <<< Declarar no escopo superior

try {
    // Carrega a configuração
    const configLoaderResult = loadConfig(path.resolve(CWD, 'tsconfig.worker.json'));
    if (configLoaderResult.resultType === 'failed') {
        throw new Error(`Falha ao carregar tsconfig.worker.json: ${configLoaderResult.message}`);
    }
    const { absoluteBaseUrl, paths } = configLoaderResult;
    console.log('Base URL:', absoluteBaseUrl);
    console.log('Paths:', paths);

    // Cria e atribui a função de correspondência à variável de escopo superior
    matchPath = createMatchPath(absoluteBaseUrl, paths);

    // <<< VERIFICAÇÃO IMPORTANTE >>>
    if (typeof matchPath !== 'function') {
        throw new Error('createMatchPath de tsconfig-paths não retornou uma função válida.');
    }
    console.log('Função matchPath criada com sucesso.');

} catch (error) {
    console.error("Erro crítico ao inicializar o resolvedor de alias:", error);
    process.exit(1); // Sai se não conseguir inicializar
}


async function replaceAliasesInFile(filePath) {
    // Adiciona verificação aqui também, por segurança
    if (typeof matchPath !== 'function') {
        console.error(`ERRO INTERNO: matchPath não é função ao processar ${filePath}`);
        return; // Pula o arquivo se a função não for válida
    }
    try {
        let content = await fsPromises.readFile(filePath, 'utf8');
        let changed = false;
        const requireRegex = /require\((["'])(@\/.*?)\1\)/g;

        content = content.replace(requireRegex, (match, quote, aliasPath) => {
            try {
                const resolved = matchPath(aliasPath); // Usa a variável do escopo superior
                if (resolved) {
                    let relativePath = path.relative(path.dirname(filePath), resolved);
                    if (!relativePath.startsWith('.')) {
                        relativePath = './' + relativePath;
                    }
                    relativePath = relativePath.replace(/\$/, '');
                    console.log(`  ${path.basename(filePath)}: Alias "${aliasPath}" -> Relative "${relativePath}"`);
                    changed = true;
                    return `require(${quote}${relativePath}${quote})`;
                } else {
                    console.warn(`  ${path.basename(filePath)}: Não foi possível resolver o alias "${aliasPath}"`);
                    return match;
                }
            } catch (replaceError) {
                // Captura erros que podem ocorrer dentro do matchPath
                console.error(`  Erro ao tentar resolver alias "${aliasPath}" em ${path.basename(filePath)}:`, replaceError);
                return match; // Retorna o original em caso de erro na resolução
            }
        });

        if (changed) {
            await fsPromises.writeFile(filePath, content, 'utf8');
            console.log(`  -> Aliases substituídos em ${path.basename(filePath)}`);
        }
    } catch (error) {
        console.error(`Erro ao processar ${filePath}:`, error);
    }
}

async function walkDir(dir) {
    try {
        const entries = await fsPromises.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.resolve(dir, entry.name);
            if (entry.isDirectory()) {
                await walkDir(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                await replaceAliasesInFile(fullPath);
            }
        }
    } catch (walkError) {
         console.error(`Erro ao percorrer o diretório ${dir}:`, walkError);
    }
}

// Função principal IIFE
(async () => {
    console.log(`Iniciando substituição de aliases na pasta: ${DIST_DIR}`);
    if (!fs.existsSync(DIST_DIR)) {
        console.error(`Diretório ${DIST_DIR} não encontrado. Execute 'tsc' primeiro.`);
        process.exit(1);
    }
    // Verificação final antes de iniciar
    if (typeof matchPath !== 'function') {
        console.error('ERRO CRÍTICO: A função matchPath não está definida corretamente antes de iniciar a varredura.');
        process.exit(1);
    }
    await walkDir(DIST_DIR);
    console.log('Substituição de aliases concluída.');
})();   