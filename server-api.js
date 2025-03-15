import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';

// Carrega as variáveis de ambiente
dotenv.config();

// Função para normalizar texto para busca
function normalizeSearchText(text) {
  if (!text) return '';
  
  // Remove acentos
  text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Converte para minúsculo
  text = text.toLowerCase();
  
  // Remove caracteres especiais
  text = text.replace(/[^a-z0-9\s]/g, '');
  
  return text;
}

// Configuração do banco de dados usando variáveis de ambiente
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT || '5432'),
});

// Função para garantir que a extensão unaccent está instalada
async function setupDatabase() {
  const client = await pool.connect();
  try {
    // Instala a extensão unaccent se não existir
    await client.query('CREATE EXTENSION IF NOT EXISTS unaccent;');
    console.log('Extensão unaccent configurada com sucesso!');
  } catch (error) {
    console.error('Erro ao configurar extensão unaccent:', error);
  } finally {
    client.release();
  }
}

// Inicializa o servidor Express
const app = express();
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0'; // Permite conexões de qualquer IP

// Configuração do CORS para aceitar requisições de qualquer origem
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Adiciona middleware para log de requisições
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.use(bodyParser.json());

// Configura o banco de dados antes de iniciar o servidor
setupDatabase().then(() => {
  // Teste de conexão com o banco de dados
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('Erro ao conectar ao banco de dados:', err);
    } else {
      console.log('Conexão com o banco de dados estabelecida:', res.rows[0]);
    }
  });
});

// Rotas da API
const apiRouter = express.Router();

// GET /api/products/search - Buscar produtos por título
apiRouter.get('/products/search', async (req, res) => {
  try {
    const { title } = req.query;
    
    if (!title) {
      return res.status(400).json({ error: 'O parâmetro "title" é obrigatório' });
    }

    // Busca usando a função de normalização no banco
    const query = `
      WITH normalized_search AS (
        SELECT normalize_search_text($1) as search_term
      )
      SELECT p.* 
      FROM products p, normalized_search ns
      WHERE normalize_search_text(p.name) LIKE '%' || ns.search_term || '%'
      AND p.active = true 
      ORDER BY p.name;
    `;
    
    // Log para debug
    console.log('Termo de busca:', title);
    
    const result = await pool.query(query, [title]);
    
    // Log para debug
    console.log('Número de resultados:', result.rows.length);
    
    // Converte os preços para números
    const products = result.rows.map(product => ({
      ...product,
      price: parseFloat(product.price)
    }));
    
    res.json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos por título:', error);
    console.error('Detalhes do erro:', error.message);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// GET /api/products - Obter todos os produtos
apiRouter.get('/products', async (req, res) => {
  try {
    const includeInactive = req.query.active !== 'true';
    
    let query = 'SELECT * FROM products';
    if (!includeInactive) {
      query += ' WHERE active = true';
    }
    query += ' ORDER BY name';
    
    const result = await pool.query(query);
    
    // Converte os preços para números
    const products = result.rows.map(product => ({
      ...product,
      price: parseFloat(product.price)
    }));
    
    res.json(products);
  } catch (error) {
    console.error('Erro ao buscar produtos:', error);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// GET /api/products/:id - Obter um produto específico
apiRouter.get('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    // Converte o preço para número
    const product = {
      ...result.rows[0],
      price: parseFloat(result.rows[0].price)
    };
    
    res.json(product);
  } catch (error) {
    console.error(`Erro ao buscar produto ${req.params.id}:`, error);
    res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

// POST /api/products - Criar um novo produto
apiRouter.post('/products', async (req, res) => {
  try {
    const { 
      name, url, price, description, brand, gender, 
      image, categories, variations, active 
    } = req.body;
    
    // Validação básica
    if (!name || !url || !price) {
      return res.status(400).json({ error: 'Nome, URL e preço são obrigatórios' });
    }
    
    const result = await pool.query(
      `INSERT INTO products 
       (name, url, price, description, brand, gender, image, categories, variations, active) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
       RETURNING *`,
      [
        name, 
        url, 
        price, 
        description || '', 
        brand || '', 
        gender || '', 
        image || '', 
        JSON.stringify(categories || []), 
        JSON.stringify(variations || []),
        active !== undefined ? active : true
      ]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Erro ao criar produto:', error);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// PUT /api/products/:id - Atualizar um produto existente
apiRouter.put('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, url, price, description, brand, gender, 
      image, categories, variations, active 
    } = req.body;
    
    // Verificar se o produto existe
    const checkResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    // Atualizar o produto
    const result = await pool.query(
      `UPDATE products 
       SET name = $1, url = $2, price = $3, description = $4, 
           brand = $5, gender = $6, image = $7, categories = $8, 
           variations = $9, active = $10
       WHERE id = $11
       RETURNING *`,
      [
        name, 
        url, 
        price, 
        description || '', 
        brand || '', 
        gender || '', 
        image || '', 
        JSON.stringify(categories || []), 
        JSON.stringify(variations || []),
        active !== undefined ? active : true,
        id
      ]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Erro ao atualizar produto ${req.params.id}:`, error);
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// DELETE /api/products/:id - Excluir um produto
apiRouter.delete('/products/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Verificar se o produto existe
    const checkResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    // Excluir o produto
    await pool.query('DELETE FROM products WHERE id = $1', [id]);
    
    res.status(204).send();
  } catch (error) {
    console.error(`Erro ao excluir produto ${req.params.id}:`, error);
    res.status(500).json({ error: 'Erro ao excluir produto' });
  }
});

// PATCH /api/products/:id/toggle-active - Alternar o status ativo/inativo de um produto
apiRouter.patch('/products/:id/toggle-active', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;
    
    if (active === undefined) {
      return res.status(400).json({ error: 'O campo "active" é obrigatório' });
    }
    
    // Verificar se o produto existe
    const checkResult = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    
    // Atualizar o status do produto
    const result = await pool.query(
      'UPDATE products SET active = $1 WHERE id = $2 RETURNING *',
      [active, id]
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error(`Erro ao alterar status do produto ${req.params.id}:`, error);
    res.status(500).json({ error: 'Erro ao alterar status do produto' });
  }
});

// Registra o router da API
app.use('/api', apiRouter);

// Inicia o servidor
app.listen(PORT, HOST, () => {
  console.log(`API Server rodando em http://${HOST}:${PORT}`);
});
