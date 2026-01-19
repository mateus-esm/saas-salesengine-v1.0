export type TenantId = 'advai' | 'solon' | 'cb' | 'nutria' | 'imob' | 'bmg' | 'leadland' | 'default';

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

// All tenants share the Solo Ventures design system (orange gradient)
// Only name, nicho, domain and custom fields differ
export const tenants: Record<TenantId, TenantConfig> = {
  advai: {
    id: 'advai',
    name: 'AdvAI',
    nicho: 'juridico',
    domain: 'advai.soloventures.com.br',
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
    description: 'Assistente Jurídico Inteligente',
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
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
    description: 'Máquina de Vendas para Energia Solar',
    customFields: [
      { key: 'consumo_medio', label: 'Consumo Médio (kWh)', type: 'number', placeholder: 'Ex: 500' },
      { key: 'valor_conta', label: 'Valor da Conta (R$)', type: 'number', placeholder: 'Ex: 350' },
      { key: 'tipo_telhado', label: 'Tipo de Telhado', type: 'select', options: ['Cerâmica', 'Fibrocimento', 'Metálico', 'Laje', 'Outro'] },
    ],
  },
  cb: {
    id: 'cb',
    name: 'Cinemas Benfica',
    nicho: 'cinema',
    domain: 'cb.soloventures.com.br',
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
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
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
    description: 'Máquina de Vendas para Nutricionistas',
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
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
    description: 'Máquina de Vendas para Imobiliárias',
    customFields: [
      { key: 'tipo_imovel', label: 'Tipo de Imóvel', type: 'select', options: ['Apartamento', 'Casa', 'Terreno', 'Comercial', 'Rural'] },
      { key: 'bairro_interesse', label: 'Bairro de Interesse', type: 'text', placeholder: 'Ex: Centro' },
      { key: 'faixa_preco', label: 'Faixa de Preço', type: 'select', options: ['Até R$ 200 mil', 'R$ 200-500 mil', 'R$ 500 mil - 1 milhão', 'Acima de R$ 1 milhão'] },
    ],
  },
  bmg: {
    id: 'bmg',
    name: 'Be My Guest',
    nicho: 'bmg',
    domain: 'bmg.soloventures.com.br',
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
    description: 'Máquina de Vendas Automatizada',
    customFields: [],
  },
  leadland: {
    id: 'leadland',
    name: 'Lead Land',
    nicho: 'leadland',
    domain: 'leadland.soloventures.com.br',
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
    description: 'Máquina de Vendas Automatizada',
    customFields: [],
  },
  default: {
    id: 'default',
    name: 'Solo SaaS',
    nicho: 'geral',
    domain: 'soloventures.com.br',
    logo: '/solo-ventures-icon-512.png',
    logoLight: '/solo-ventures-icon-512.png',
    primaryColor: '28 100% 50%', // Solo Ventures Orange
    description: 'Máquina de Vendas Automatizada',
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
  
  // Default to Solo SaaS
  return tenants.default;
}

export function getTenantById(id: TenantId): TenantConfig {
  return tenants[id] || tenants.default;
}