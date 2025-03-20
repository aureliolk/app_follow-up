import pg from "pg"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Carrega as variáveis de ambiente do .env
dotenv.config()

const { Pool } = pg

// Configuração do banco de dados usando variáveis de ambiente
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
})

async function createDatabaseIfNotExists() {
  const client = await initialPool.connect()
  try {
    // Verifica se o banco de dados existe
    const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [process.env.DB_NAME])

    // Se o banco não existe, cria
    if (result.rows.length === 0) {
      console.log(`Criando banco de dados ${process.env.DB_NAME}...`)
      // Necessário desconectar outros clientes antes de criar o banco
      await client.query(`DROP DATABASE IF EXISTS ${process.env.DB_NAME}`)
      await client.query(`CREATE DATABASE ${process.env.DB_NAME}`)
      console.log("Banco de dados criado com sucesso!")
    }
  } finally {
    client.release()
    await initialPool.end()
  }
}

async function runMigration() {
  try {
    // Primeiro verifica e cria o banco se necessário
    await createDatabaseIfNotExists()

    console.log("Conectando ao banco de dados...")
    const client = await pool.connect()

    try {
      const migrationPath = path.join(__dirname, "..", "migrations", "combined_migration.sql")
      console.log("Executando migração combinada...")
      const sql = fs.readFileSync(migrationPath, "utf8")

      await client.query(sql)
      console.log("Migração concluída com sucesso!")
    } finally {
      client.release()
    }
  } catch (err) {
    console.error("Erro ao executar migração:", err)
  } finally {
    await pool.end()
  }
}

runMigration()

