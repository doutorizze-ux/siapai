function Privacy() {
  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-3xl px-4 py-12">
        <h1 className="text-3xl font-bold text-gray-900">
          Política de Privacidade — SiapAI
        </h1>
        <p className="mt-2 text-sm text-gray-500">Última atualização: 17 de agosto de 2026</p>

        <section className="mt-8 space-y-6 text-gray-700">
          <p>
            Esta Política de Privacidade descreve como a extensão <strong>SiapAI</strong>
            (disponível na Chrome Web Store) e o serviço em <a className="text-green-700 underline" href="https://siapai.online">siapai.online</a> tratam as informações
            dos usuários.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">1. Dados que a extensão utiliza</h2>
          <p>A extensão SiapAI pode utilizar os seguintes dados, sempre relacionados ao funcionamento dos recursos oferecidos:</p>
          <ul className="list-disc space-y-1 pl-6">
            <li><strong>Endereço de e-mail:</strong> utilizado para a ativação e validação da licença de acesso ao serviço.</li>
            <li><strong>Informações de autenticação:</strong> tokens e credenciais necessárias para validar a licença junto ao serviço SiapAI.</li>
            <li><strong>Conteúdo do site SIAP:</strong> o texto e os campos das páginas do SIAP lidos e preenchidos exclusivamente quando o professor solicita uma ação pelo painel lateral da extensão (planejamento, frequência, conteúdo programático e PEI).</li>
          </ul>
          <p>
            As demais informações de operação (meses escolhidos, preferências e estado temporário da execução) são armazenadas
            apenas localmente no navegador do próprio usuário e não são transmitidas a terceiros.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">2. Como os dados são utilizados</h2>
          <p>
            Os dados são utilizados somente para fornecer e manter os recursos solicitados pelo usuário: validar a licença,
            processar as solicitações de geração de conteúdo e executar as ações do professor dentro do SIAP.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">3. Compartilhamento de dados</h2>
          <p>
            A SiapAI <strong>não vende, não aluga e não transfere dados dos usuários a terceiros</strong>, exceto nos casos
            permitidos pela Política do Programa para Desenvolvedores da Chrome Web Store (por exemplo, para cumprir a lei,
            proteger contra fraudes ou realizar uma venda de ativos com consentimento prévio do usuário).
          </p>

          <h2 className="text-xl font-semibold text-gray-900">4. Serviços terceiros</h2>
          <p>
            O serviço SiapAI utiliza processamento de linguagem natural fornecido pelo Google (Gemini) para gerar as sugestões
            de conteúdo pedagógico solicitadas pelo professor, além do serviço de pagamento Asaas para emitir cobranças Pix.
            O pagamento não é processado pela SiapAI.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">5. Uso limitado (Limited Use)</h2>
          <p>
            O uso das informações recebidas das APIs do Google e dos dados do usuário adere à Política de Dados de Usuário da
            Chrome Web Store, incluindo os requisitos de Uso Limitado: os dados são usados exclusivamente para fornecer ou
            melhorar os recursos do produto, não são transferidos para plataformas de anúncios, corretores de dados ou
            finalidades de crédito, e humanos não leem dados de usuários, exceto nos casos previstos na política (consentimento
            explícito do usuário, dados agregados e anonimizados, segurança e cumprimento da lei).
          </p>

          <h2 className="text-xl font-semibold text-gray-900">6. Segurança</h2>
          <p>
            Toda transmissão de dados entre a extensão e o serviço ocorre por HTTPS, com criptografia em trânsito. As
            credenciais da licença não são exibidas publicamente e não são utilizadas para acessar o SIAP em nome do usuário.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">7. Armazenamento local</h2>
          <p>
            Preferências e estado de execução ficam armazenados no navegador do usuário (local/session storage). O usuário
            pode remover a extensão a qualquer momento, o que elimina esses dados locais.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">8. Alterações nesta política</h2>
          <p>
            Esta política pode ser atualizada periodicamente. A versão mais recente estará sempre disponível nesta página.
          </p>

          <h2 className="text-xl font-semibold text-gray-900">9. Contato</h2>
          <p>
            Dúvidas sobre esta política podem ser enviadas pelo site <a className="text-green-700 underline" href="https://siapai.online">siapai.online</a>.
          </p>
        </section>
      </div>
    </div>
  );
}

export default Privacy;
