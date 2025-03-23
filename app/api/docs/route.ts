import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { marked } from 'marked';

const readFile = promisify(fs.readFile);

export async function GET() {
  try {
    // Caminho para o arquivo de documentação markdown
    const docsPath = path.join(process.cwd(), 'public', 'follow-up-api-docs.md');
    
    // Ler o conteúdo do arquivo
    const markdownContent = await readFile(docsPath, 'utf8');
    
    // Converter markdown para HTML
    const htmlContent = marked(markdownContent);
    
    // Resposta com HTML básico contendo o conteúdo da documentação
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>API de Follow-up - Documentação</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            pre {
              background-color: #f5f5f5;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
            }
            code {
              font-family: Menlo, Monaco, Consolas, 'Courier New', monospace;
            }
            table {
              border-collapse: collapse;
              width: 100%;
              margin: 20px 0;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px 12px;
              text-align: left;
            }
            th {
              background-color: #f2f2f2;
            }
            h1, h2, h3 {
              margin-top: 28px;
            }
            h1 {
              border-bottom: 2px solid #eaecef;
              padding-bottom: 10px;
            }
            h2 {
              border-bottom: 1px solid #eaecef;
              padding-bottom: 8px;
            }
            a {
              color: #0366d6;
              text-decoration: none;
            }
            a:hover {
              text-decoration: underline;
            }
            blockquote {
              border-left: 4px solid #ddd;
              padding-left: 16px;
              margin-left: 0;
              color: #666;
            }
          </style>
        </head>
        <body>
          ${htmlContent}
        </body>
      </html>
    `;
    
    return new NextResponse(fullHtml, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8'
      }
    });
  } catch (error) {
    console.error('Erro ao ler a documentação da API:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Erro ao carregar a documentação da API" 
      }, 
      { status: 500 }
    );
  }
}