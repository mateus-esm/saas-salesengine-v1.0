// Sprint 17 — páginas públicas de Política de Privacidade e Termos de Uso do Rev.
// O Meta exige as duas URLs para publicar o app (modo Live). Texto-base: revisar com o jurídico.

import type { ReactNode } from "react";

const CONTACT = "suporte@soloventures.com.br";
const UPDATED = "27/11/2026";

function LegalShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-10 text-sm leading-relaxed">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">Rev · Solo Ventures — atualizado em {UPDATED}</p>
      </header>
      {children}
      <footer className="border-t pt-4 text-muted-foreground">
        Dúvidas: <a className="underline" href={`mailto:${CONTACT}`}>{CONTACT}</a>
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalShell title="Política de Privacidade">
      <p>
        O Rev é um CRM de vendas oferecido pela Solo Ventures a empresas (nossos clientes). Esta política explica
        como tratamos dados pessoais no Rev, em conformidade com a LGPD (Lei 13.709/2018).
      </p>
      <Section title="1. Papéis">
        <p>
          Para os dados dos leads e clientes finais cadastrados no Rev, a empresa que usa o Rev é a controladora e a
          Solo Ventures atua como operadora, tratando os dados apenas para prestar o serviço. Para os dados dos
          usuários do Rev (nome, e-mail, telefone de login), a Solo Ventures é controladora.
        </p>
      </Section>
      <Section title="2. Dados que tratamos">
        <ul className="list-disc space-y-1 pl-5">
          <li>Dados de cadastro dos usuários do Rev.</li>
          <li>
            Dados de leads enviados pelas integrações que o cliente conecta, como formulários de anúncios do Meta
            (Facebook/Instagram): nome, e-mail, telefone, respostas do formulário e a origem (anúncio, campanha,
            formulário).
          </li>
          <li>Dados de uso do sistema e registros técnicos (logs) para segurança e suporte.</li>
        </ul>
      </Section>
      <Section title="3. Integração com o Meta">
        <p>
          Quando um cliente conecta o portfólio do Meta pelo Login do Facebook para Empresas, o Rev recebe acesso às
          Páginas, contas de anúncio e pixels que o cliente escolher. Usamos esse acesso somente para: receber os
          leads dos formulários instantâneos e criá-los no CRM do próprio cliente; ler nomes e IDs de anúncios e
          campanhas para mostrar a origem de cada lead; e, quando o cliente ativar, enviar à API de Conversões do Meta
          eventos sobre a evolução dos leads no funil, com dados pessoais protegidos por hash (SHA-256). Não vendemos
          esses dados nem os usamos para outra finalidade.
        </p>
      </Section>
      <Section title="4. Armazenamento e segurança">
        <p>
          Os dados ficam em infraestrutura de nuvem (Supabase). Tokens de acesso são guardados criptografados em cofre
          e nunca aparecem na tela. O acesso é restrito por equipe e por função.
        </p>
      </Section>
      <Section title="5. Retenção e exclusão">
        <p>
          Mantemos os dados enquanto o cliente usar o Rev ou conforme exigido por lei. O cliente pode desconectar o
          Meta a qualquer momento, o que apaga os tokens. Usuários do Facebook podem pedir a exclusão pelo próprio
          Facebook (Configurações › Apps e sites), e o status fica disponível em{" "}
          <a className="underline" href="/exclusao-de-dados">/exclusao-de-dados</a>. Para dados de leads, o titular deve
          procurar a empresa que coletou o dado; ajudamos essa empresa a atender o pedido.
        </p>
      </Section>
      <Section title="6. Direitos do titular">
        <p>
          Você pode pedir confirmação, acesso, correção, anonimização, portabilidade ou exclusão dos seus dados, e
          revogar consentimentos, pelo e-mail {CONTACT}.
        </p>
      </Section>
      <Section title="7. Compartilhamento">
        <p>
          Compartilhamos dados apenas com provedores necessários à operação (hospedagem, envio de mensagens) e com o
          Meta, quando o cliente ativa as integrações descritas acima.
        </p>
      </Section>
    </LegalShell>
  );
}

export function TermsOfService() {
  return (
    <LegalShell title="Termos de Uso">
      <Section title="1. O serviço">
        <p>
          O Rev é um software de CRM e automação de vendas oferecido pela Solo Ventures a empresas, por assinatura.
          Ao usar o Rev você concorda com estes termos e com a{" "}
          <a className="underline" href="/privacidade">Política de Privacidade</a>.
        </p>
      </Section>
      <Section title="2. Responsabilidades do cliente">
        <ul className="list-disc space-y-1 pl-5">
          <li>Manter seus acessos em sigilo e usar o Rev de forma lícita.</li>
          <li>
            Ter base legal para os dados de leads que coloca no Rev e respeitar as políticas das plataformas que
            conecta (por exemplo, as Políticas da Plataforma Meta e os Termos de Anúncios de Cadastro).
          </li>
        </ul>
      </Section>
      <Section title="3. Integrações de terceiros">
        <p>
          As integrações (Meta, WhatsApp e outras) dependem dos serviços desses terceiros. O cliente pode conectar e
          desconectar quando quiser; mudanças ou indisponibilidade desses serviços podem afetar as integrações.
        </p>
      </Section>
      <Section title="4. Dados">
        <p>
          Os dados do cliente pertencem ao cliente. Tratamos esses dados apenas para prestar o serviço, conforme a
          Política de Privacidade.
        </p>
      </Section>
      <Section title="5. Disponibilidade e limitação de responsabilidade">
        <p>
          Trabalhamos para manter o Rev disponível e seguro, mas o serviço é oferecido no estado em que se encontra.
          Na extensão permitida por lei, não respondemos por lucros cessantes ou danos indiretos.
        </p>
      </Section>
      <Section title="6. Contato">
        <p>Fale com a gente em {CONTACT}.</p>
      </Section>
    </LegalShell>
  );
}
