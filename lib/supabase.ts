import { createClient } from "@supabase/supabase-js"

// Para uso em componentes de servidor
export const createServerSupabaseClient = () => {
  if (typeof window !== 'undefined') {
    console.error('createServerSupabaseClient foi chamado no lado do cliente')
    // Retorna um cliente com funcionalidade limitada para evitar erro completo
    return createClientSupabaseClient()
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  })
}

// Para componentes do cliente (padrão singleton)
let clientSupabaseInstance: ReturnType<typeof createClient> | null = null

export const createClientSupabaseClient = () => {
  if (clientSupabaseInstance) return clientSupabaseInstance

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Credenciais do Supabase não estão disponíveis no cliente')
    // Retornar um cliente alternativo para evitar quebras
    // Este é apenas para evitar erros - terá funcionalidade limitada
    const dummyUrl = 'https://placeholder.supabase.co'
    const dummyKey = 'dummy-key'
    clientSupabaseInstance = createClient(dummyUrl, dummyKey)
    return clientSupabaseInstance
  }

  clientSupabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
  return clientSupabaseInstance
}

// Cliente Admin para migrações e outras operações de administração
// Usando uma função para evitar execução no cliente
export const createAdminClient = () => {
  if (typeof window !== 'undefined') {
    console.error('createAdminClient foi chamado no lado do cliente')
    // Retorna um cliente com funcionalidade limitada
    return createClientSupabaseClient()
  }

  return createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Exportando um getter para o admin client em vez de criar diretamente
export const getSupabaseAdmin = () => {
  return createAdminClient()
}

// Verificação do ambiente para exportação padrão
const supabase = typeof window === 'undefined' 
  ? createServerSupabaseClient() 
  : createClientSupabaseClient()

export default supabase