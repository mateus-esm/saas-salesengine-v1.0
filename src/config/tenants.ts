export type TenantId = 'advai' | 'solon' | 'cb' | 'nutria' | 'imob' | 'default';

export interface CustomFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select';
  options?: string[];
  placeholder?: string;
}

export interface TenantConfig {
  id: TenantId;
  name: string;
  nicho: string;
  domain: string;
  logo: string;
  logoLight: string;
  primaryColor: string;
  description: string;
  customFields?: CustomFieldDefinition[];
}

export const tenants: Record<TenantId, TenantConfig> = {
  advai: {
    id: 'advai',
    name: 'AdvAI',
    nicho: 'juridico',
    domain: 'advai.soloventures.com.br',
    logo: '/tenants/advai/logo.png',
    logoLight: '/tenants/advai/logo-light.png',
    primaryColor: '220 70% 50%', // Blue
    description: 'Agente SDR para Escritórios de Advocacia',
    customFields: [
      { key: 'numero_processo', label: 'Número do Processo', type: 'text', placeholder: '0000000-00.0000.0.00.0000' },
      { key: 'area_atuacao', label: 'Área de Atuação', type: 'select', options: ['Trabalhista', 'Cível', 'Criminal', 'Tributário', 'Empresarial', 'Família', 'Outros'] },
    ],
  },
  solon: {
    id: 'solon',
    name: 'Solon',
    nicho: 'energia_solar',
    domain: 'solon.soloventures.com.br',
    logo: '/tenants/solon/logo.png',
    logoLight: '/tenants/solon/logo-light.png',
    primaryColor: '45 100% 50%', // Solar Yellow/Orange
    description: 'Agente SDR para Energia Solar',
    customFields: [
      { key: 'consumo_medio', label: 'Consumo Médio (kWh)', type: 'number', placeholder: 'Ex: 500' },
      { key: 'valor_conta', label: 'Valor da Conta (R$)', type: 'number', placeholder: 'Ex: 350' },
      { key: 'tipo_telhado', label: 'Tipo de Telhado', type: 'select', options: ['Cerâmica', 'Fibrocimento', 'Metálico', 'Laje', 'Outro'] },
    ],
  },
  cb: {
    id: 'cb',
    name: 'CB',
    nicho: 'cinemas benfica',
    domain: 'cb.soloventures.com.br',
    logo: '/tenants/cb/logo.png',
    logoLight: '/tenants/cb/logo-light.png',
    primaryColor: '160 60% 45%', // Green
    description: 'Agente de Suporte do Cinemas Benfica',
    customFields: [
      { key: 'filme_interesse', label: 'Filme de Interesse', type: 'text', placeholder: 'Nome do filme' },
      { key: 'data_sessao', label: 'Data da Sessão', type: 'text', placeholder: 'DD/MM/AAAA' },
    ],
  },
  nutria: {
    id: 'nutria',
    name: 'NutriA',
    nicho: 'nutricao',
    domain: 'nutria.soloventures.com.br',
    logo: '/tenants/nutria/logo.png',
    logoLight: '/tenants/nutria/logo-light.png',
    primaryColor: '140 70% 45%', // Healthy Green
    description: 'Agente SDR para Nutricionistas',
    customFields: [
      { key: 'objetivo', label: 'Objetivo', type: 'select', options: ['Emagrecimento', 'Ganho de Massa', 'Reeducação Alimentar', 'Saúde Geral', 'Outro'] },
      { key: 'restricao_alimentar', label: 'Restrição Alimentar', type: 'text', placeholder: 'Ex: Intolerância a lactose' },
    ],
  },
  imob: {
    id: 'imob',
    name: 'Imob',
    nicho: 'imobiliario',
    domain: 'imob.soloventures.com.br',
    logo: '/tenants/imob/logo.png',
    logoLight: '/tenants/imob/logo-light.png',
    primaryColor: '200 80% 50%', // Real Estate Blue
    description: 'Agente SDR para Mercado Imobiliário',
    customFields: [
      { key: 'tipo_imovel', label: 'Tipo de Imóvel', type: 'select', options: ['Apartamento', 'Casa', 'Terreno', 'Comercial', 'Rural'] },
      { key: 'bairro_interesse', label: 'Bairro de Interesse', type: 'text', placeholder: 'Ex: Centro' },
      { key: 'faixa_preco', label: 'Faixa de Preço', type: 'select', options: ['Até R$ 200 mil', 'R$ 200-500 mil', 'R$ 500 mil - 1 milhão', 'Acima de R$ 1 milhão'] },
    ],
  },
  default: {
    id: 'default',
    name: 'Solo Ventures',
    nicho: 'geral',
    domain: 'soloventures.com.br',
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '262 83% 58%', // Original Purple
    description: 'Plataforma SoloAI SaaS',
    customFields: [],
  },
};

export function getTenantByHostname(hostname: string): TenantConfig {
  // Remove port for local development
  const cleanHostname = hostname.split(':')[0];
  
  // Check for subdomain match
  for (const tenant of Object.values(tenants)) {
    if (tenant.id !== 'default' && cleanHostname.includes(tenant.id)) {
      return tenant;
    }
  }
  
  // Check for exact domain match
  const found = Object.values(tenants).find(t => t.domain === cleanHostname);
  if (found) return found;
  
  // Default fallback
  return tenants.default;
}

export function getTenantById(id: TenantId): TenantConfig {
  return tenants[id] || tenants.default;
}
