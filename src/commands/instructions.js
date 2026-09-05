import { registerCommand } from './index.js'

const PAGES = {
  geral:
    `📖 *INSTRUÇÕES — Geral*\n` +
    `_Disponível para todos os membros_\n\n` +
    `📋 */menu*\n` +
    `└ Lista resumida de todos os comandos disponíveis.\n\n` +
    `ℹ️ */info*\n` +
    `└ Informações do grupo: nome, membros, admins, data de criação.\n\n` +
    `👑 */admins*\n` +
    `└ Lista todos os administradores do grupo.\n\n` +
    `👤 */membros*\n` +
    `└ Lista os membros não-admin (máx. 30). Requer admin.\n\n` +
    `📜 */regras*\n` +
    `└ Mostra as regras do grupo.\n\n` +
    `📊 */stats*\n` +
    `└ Estatísticas do grupo.\n\n` +
    `🗳️ */sondagem <pergunta> | opção1 | opção2*\n` +
    `└ Cria uma enquete nativa do WhatsApp (2-12 opções).\n` +
    `└ Ex: */sondagem Melhor dia? | Segunda | Terça | Sexta*\n\n` +
    `🚩 */denunciar*\n` +
    `└ Responde a uma mensagem e envia */denunciar* para a reportar.\n\n` +
    `⭐ */reputacao [@membro]*\n` +
    `└ Mostra o nível e pontos de reputação de um membro (ou teu).\n\n` +
    `🏆 */top*\n` +
    `└ Top 10 membros com mais reputação no grupo.\n\n` +
    `📋 */resumo [N]*\n` +
    `└ A Orbis resume as últimas N mensagens da conversa (padrão: 20).\n` +
    `└ Ex: */resumo 50*\n\n` +
    `📖 */instrucoes [secção]*\n` +
    `└ Instruções detalhadas. Secções: geral, moderacao, config, ia, extra.`,

  moderacao:
    `📖 *INSTRUÇÕES — Moderação*\n` +
    `_Exclusivo para administradores_\n\n` +
    `⚠️ */warn @membro [motivo]*\n` +
    `└ Dá um aviso. Ao atingir o limite → expulsão automática.\n` +
    `└ Ex: */warn @João spam repetido*\n\n` +
    `🔕 */warnings @membro*\n` +
    `└ Mostra o número de avisos do membro.\n\n` +
    `🧹 */clearwarn @membro*\n` +
    `└ Apaga todos os avisos do membro.\n\n` +
    `📋 */historico @membro*\n` +
    `└ Mostra o histórico completo: avisos, bans e denúncias recebidas.\n\n` +
    `👢 */kick @membro*\n` +
    `└ Expulsa o membro imediatamente.\n\n` +
    `🔨 */ban @membro [motivo]*\n` +
    `└ Bane o membro: expulsa e regista na lista de banidos.\n` +
    `└ Ex: */ban @Pedro burla*\n\n` +
    `📜 */banidos*\n` +
    `└ Lista os últimos 20 membros banidos.\n\n` +
    `➕ */adicionar <número>*\n` +
    `└ Readmite um membro banido pelo número.\n` +
    `└ Ex: */adicionar 244912345678*\n\n` +
    `🔒 */trancar* / 🔓 */abrir*\n` +
    `└ Tranca/abre o grupo para mensagens.\n\n` +
    `🔇 */mute @membro [tempo]*\n` +
    `└ Muta o membro. Com tempo: desmuta automaticamente.\n` +
    `└ Formatos: 10m, 2h, 1d. Ex: */mute @Ana 30m*\n\n` +
    `🔊 */unmute @membro*\n` +
    `└ Desmuta o membro.\n\n` +
    `👑 */promover @membro* / 🔒 */despromover @membro*\n` +
    `└ Promove/despromove a administrador.\n\n` +
    `📢 */anunciar <texto>*\n` +
    `└ Envia um anúncio formatado no grupo.\n\n` +
    `⏰ */agendamento <tempo> <mensagem>*\n` +
    `└ Agenda uma mensagem única. Ex: */agendamento 1h Reunião em breve!*\n\n` +
    `🚨 */denuncias*\n` +
    `└ Mostra as últimas denúncias registadas.`,

  config:
    `📖 *INSTRUÇÕES — Configuração*\n` +
    `_Configurar o comportamento do bot_\n\n` +
    `⚙️ */config*\n` +
    `└ Sem argumentos: mostra todas as configurações actuais.\n` +
    `└ Com argumentos: altera uma configuração.\n\n` +
    `*Opções do /config:*\n` +
    `└ */config spam on|off* — Anti-spam\n` +
    `└ */config link on|off* — Anti-link\n` +
    `└ */config flood on|off* — Anti-flood\n` +
    `└ */config welcome on|off* — Boas-vindas\n` +
    `└ */config warnings <N>* — Limite de avisos (ex: */config warnings 5*)\n` +
    `└ */config reputacao on|off* — Sistema de reputação/níveis\n` +
    `└ */config silencio <inicio> <fim>* — Modo silêncio por horário\n` +
    `   Ex: */config silencio 22 6* (das 22h às 6h a IA não responde)\n` +
    `└ */config whitelist add|remove|clear [domínio]*\n` +
    `   Ex: */config whitelist add youtube.com* — permite links do YouTube\n\n` +
    `🔗 */antilink on|off*\n` +
    `└ Atalho para activar/desactivar anti-link.\n\n` +
    `🚫 */antispam on|off* / 🌊 */antiflood on|off*\n` +
    `└ Atalhos para anti-spam e anti-flood.\n\n` +
    `📝 */setregras <texto>*\n` +
    `└ Define as regras personalizadas do grupo.\n\n` +
    `👋 */setwelcome <mensagem>*\n` +
    `└ Define a mensagem de boas-vindas.\n` +
    `└ Variáveis: *{nome}* e *{grupo}*\n` +
    `└ Ex: */setwelcome Olá {nome}, bem-vindo ao {grupo}!*\n\n` +
    `🔔 */setadmingroup <ID>*\n` +
    `└ Define este grupo como receptor de notificações de moderação.\n` +
    `└ Ex: */setadmingroup 120363427347409993@g.us*`,

  ia:
    `📖 *INSTRUÇÕES — Inteligência Artificial*\n` +
    `_Como interagir com a Orbis_\n\n` +
    `🤖 *Como activar:*\n` +
    `└ Menciona @Orbis, escreve "orbis" ou responde a uma mensagem dela.\n` +
    `└ Em mensagem privada responde sempre.\n\n` +
    `💬 *Conversa normal:*\n` +
    `└ Faz perguntas, pede opiniões, conversa livremente.\n` +
    `└ Lê o contexto e adapta o tom ao estado do grupo.\n\n` +
    `📋 */resumo [N]*\n` +
    `└ Resume as últimas N mensagens da conversa com IA.\n\n` +
    `👥 *Mencionar membros:*\n` +
    `└ "Orbis chama o João" → menciona o João\n` +
    `└ "Orbis chama toda a gente" → menciona todos\n\n` +
    `🛡️ *Comandos por linguagem natural (só admins):*\n` +
    `└ "Orbis expulsa o Pedro"\n` +
    `└ "Orbis muta o Carlos por 30 minutos"\n` +
    `└ "Orbis avisa o João por spam"\n` +
    `└ "Orbis bane o Rui por ameaças"\n` +
    `└ "Orbis tranca/abre o grupo"\n` +
    `└ "Orbis promove o Miguel"\n` +
    `└ "Orbis anuncia que a reunião é às 18h"\n\n` +
    `🤖 *Moderação autónoma:*\n` +
    `└ Age sozinha em: insultos, ameaças, spam, discurso de ódio.\n` +
    `└ Admins e owner nunca são moderados.\n` +
    `└ Punições progressivas: aviso → mute → expulsão/ban.\n\n` +
    `🌙 *Modo silêncio:*\n` +
    `└ Fora do horário configurado a IA não responde a membros.\n` +
    `└ Admins continuam a ter acesso sempre.\n` +
    `└ Configura com: */config silencio 22 6*`,

  extra:
    `📖 *INSTRUÇÕES — Funcionalidades Extra*\n\n` +
    `⭐ *Sistema de Reputação:*\n` +
    `└ Membros ganham pontos por mensagens e perdem por infrações.\n` +
    `└ Níveis: Novato → Membro → Activo → Veterano → Elite\n` +
    `└ */reputacao [@membro]* — ver reputação\n` +
    `└ */top* — top 10 do grupo\n` +
    `└ Activar: */config reputacao on*\n\n` +
    `📋 *Resumo Diário Automático:*\n` +
    `└ A Orbis envia um resumo do dia automaticamente.\n` +
    `└ */resumodiario on [hora]* — activar (ex: */resumodiario on 22*)\n` +
    `└ */resumodiario off* — desactivar\n` +
    `└ */resumoagora* — enviar resumo imediatamente\n\n` +
    `⏰ *Agendamentos Recorrentes:*\n` +
    `└ Mensagens automáticas todos os dias ou dias úteis.\n` +
    `└ */agendarcorrente <tipo> <HH:MM> <mensagem>*\n` +
    `└ Tipos: *DAILY* (todos os dias), *MON-FRI* (dias úteis)\n` +
    `└ Ex: */agendarcorrente DAILY 09:00 Bom dia a todos!*\n` +
    `└ Ex: */agendarcorrente MON-FRI 08:30 Reunião em 30 minutos!*\n` +
    `└ */agendamentos* — ver agendamentos activos\n` +
    `└ */cancelaragendamento <id>* — cancelar um agendamento\n\n` +
    `🔗 *Whitelist de Links:*\n` +
    `└ Permite links de domínios específicos mesmo com anti-link activo.\n` +
    `└ */config whitelist add youtube.com*\n` +
    `└ */config whitelist remove youtube.com*\n` +
    `└ */config whitelist clear* — remove todos\n\n` +
    `🌙 *Modo Silêncio:*\n` +
    `└ A IA não responde a membros fora do horário definido.\n` +
    `└ */config silencio 22 6* — silêncio das 22h às 6h\n\n` +
    `📋 *Histórico de Membro:*\n` +
    `└ */historico @membro* — ver todos os avisos, bans e denúncias.`
}

registerCommand('instrucoes', { description: 'Instruções detalhadas de todos os comandos', permission: 'member' }, async ({ sock, groupId, msg, args }) => {
  const cmd = args[0]?.toLowerCase()

  const index =
    `📖 *INSTRUÇÕES — ORBIS*\n` +
    `_by Orion Technologies_\n\n` +
    `Escolhe uma secção:\n\n` +
    `📋 */instrucoes geral* — Comandos para todos\n` +
    `🛡️ */instrucoes moderacao* — Moderação e punições\n` +
    `⚙️ */instrucoes config* — Configuração do bot\n` +
    `🤖 */instrucoes ia* — Inteligência Artificial\n` +
    `✨ */instrucoes extra* — Reputação, resumos, agendamentos\n\n` +
    `_Exemplo: /instrucoes extra_`

  await sock.sendMessage(groupId, { text: PAGES[cmd] || index, quoted: msg })
})
