-- Combined migration file

-- Create genprompt table
CREATE TABLE IF NOT EXISTS genprompt (
    id SERIAL PRIMARY KEY,
    prompt TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    author VARCHAR(255) NOT NULL
);

-- Create products table
CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    url VARCHAR(1024) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    description TEXT,
    brand VARCHAR(255),
    gender VARCHAR(50),
    image VARCHAR(1024),
    categories JSONB DEFAULT '[]'::JSONB,
    variations JSONB DEFAULT '[]'::JSONB,
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Ensure active column exists and set default values
UPDATE products SET active = TRUE WHERE active IS NULL;

-- Instala a extensão unaccent para remover acentos
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Função para normalizar texto para busca
CREATE OR REPLACE FUNCTION normalize_search_text(text) RETURNS text AS $$
DECLARE
    normalized text;
BEGIN
    IF $1 IS NULL THEN
        RETURN NULL;
    END IF;

    -- Converte para minúsculo e remove acentos
    normalized := lower(unaccent($1));
    
    -- Remove caracteres especiais mantendo espaços
    normalized := regexp_replace(normalized, '[^a-z0-9\s]', '', 'g');
    
    -- Remove espaços extras
    normalized := regexp_replace(normalized, '\s+', ' ', 'g');
    normalized := trim(normalized);
    
    -- Normaliza variações comuns usando regex
    normalized := regexp_replace(normalized, '\msuti[aã][no]s?\M', 'sutia', 'g');
    normalized := regexp_replace(normalized, '\mcalcinhas?\M', 'calcinha', 'g');
    normalized := regexp_replace(normalized, '\mcalcas?\M', 'calca', 'g');
    normalized := regexp_replace(normalized, '\mvestidos?\M', 'vestido', 'g');
    normalized := regexp_replace(normalized, '\mblusas?\M', 'blusa', 'g');
    normalized := regexp_replace(normalized, '\mcamisetas?\M', 'camiseta', 'g');
    normalized := regexp_replace(normalized, '\mcamisas?\M', 'camisa', 'g');
    normalized := regexp_replace(normalized, '\mshorts?\M', 'short', 'g');
    normalized := regexp_replace(normalized, '\mbermudas?\M', 'bermuda', 'g');
    normalized := regexp_replace(normalized, '\msaias?\M', 'saia', 'g');
    normalized := regexp_replace(normalized, '\mconjuntos?\M', 'conjunto', 'g');
    normalized := regexp_replace(normalized, '\mbodies\M', 'body', 'g');
    normalized := regexp_replace(normalized, '\mmaios?\M', 'maio', 'g');
    normalized := regexp_replace(normalized, '\m(bi[qk]inis?)\M', 'biquini', 'g');
    
    RETURN normalized;
END;
$$ LANGUAGE plpgsql;
