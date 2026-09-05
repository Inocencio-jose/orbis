import { registerCommand } from './index.js'

const PAGES = {
  geral:
    `📖 *INSTRUÇÕES — Geral*\n` +
    `_Disponível para todos os membros_\n\n` +
    `📋 */menu*\n` +
    `└ Lista resumida de todos os comandos disponíveis.\n\n` +
    `ℹ️ */info*\n` +
    `└ Informações do grupo: nome, total de membros, admins, data de criação e estado (aberto/trancado).\n\n` +
    `👑 */admins*\n` +
    `└ Lista todos os administradores do grupo com menção directa.\n\n` +
    `👤 */membros*\n` +
    `└ Lista os membros não-admin (máx. 30 por vez).\n` +
    `└ _Requer permissão de admin._\n\n` +
    `📜 */regras*\n` +
    `└ Mostra as regras do grupo.\n` +
    `└ Se não foram definidas, mostra as regras padrão.\n\n` +
    `📊 */stats*\n` +
    `└ Estatísticas do grupo: total de membros, admins e membros comuns.\n\n` +
    `🗳️ */sondagem <pergunta> | opção1 | opção2 ...*\n` +
    `└ Cria uma enquete nativa do WhatsApp.\n` +
    `└ Mínimo 2 opções, máximo 12.\n` +
    `└ Separa a pergunta e as opções com *|*\n` +
    `└ Ex: */sondagem Melhor dia? | Segunda | Terça | Sexta*\n\n` +
    `🚩 */denunciar*\n` +
    `└ Responde a uma mensagem e envia */denunciar* para a reportar.\n` +
    `└ A Orbis regista a denúncia e notifica os admins automaticamente.\n\n` +
    `📖 */instrucoes [secção]*\n` +
    `└ Mostra instruções detalhadas. Secções: geral, moderacao, config, ia.`,

  moderacao:
    `📖 *INSTRUÇÕES — Moderação*\n` +
    `_Exclusivo para administradores_\n\n` +
    `⚠️ */warn @membro [motivo]*\n` +
    `└ Dá um aviso ao membro.\n` +
    `└ Ao atingir o limite (padrão: 3 avisos) o membro é expulso automaticamente.\n` +
    `└ Ex: */warn @João spam repetido*\n\n` +
    `🔕 */warnings @membro*\n` +
    `└ Mostra o número de avisos registados para o membro.\n\n` +
    `🧹 */clearwarn @membro*\n` +
    `└ Apaga todos os avisos do membro.\n\n` +
    `👢 */kick @membro*\n` +
    `└ Expulsa o membro do grupo imediatamente.\n` +
    `└ O membro pode ser readmitido manualmente.\n\n` +
    `🔨 */ban @membro [motivo]*\n` +
    `└ Bane o membro: expulsa e regista na lista de banidos.\n` +
    `└ Membro banido não pode ser readmitido sem usar /adicionar.\n` +
    `└ Ex: */ban @Pedro burla*\n\n` +
    `📜 */banidos*\n` +
    `└ Lista os últimos 20 membros banidos com motivo e data.\n\n` +
    `➕ */adicionar <número>*\n` +
    `└ Readmite um membro banido pelo número de telefone.\n` +
    `└ Remove da lista de banidos e adiciona ao grupo.\n` +
    `└ Ex: */adicionar 244912345678*\n\n` +
    `🔒 */trancar*\n` +
    `└ Tranca o grupo — apenas admins podem enviar mensagens.\n` +
    `└ Útil para anúncios ou situações de conflito.\n\n` +
    `🔓 */abrir*\n` +
    `└ Abre o grupo — todos os membros podem enviar mensagens.\n\n` +
    `🔇 */mute @membro [tempo]*\n` +
    `└ Muta o membro (despromove temporariamente).\n` +
    `└ Com tempo definido, desmuta automaticamente ao fim do período.\n` +
    `└ Formatos de tempo: *10m* (minutos), *2h* (horas), *1d* (dias).\n` +
    `└ Ex: */mute @Ana 30m* — muta por 30 minutos\n` +
    `└ Ex: */mute @Carlos* — muta sem tempo definido\n\n` +
    `🔊 */unmute @membro*\n` +
    `└ Desmuta o membro e cancela o timer automático se existir.\n\n` +
    `👑 */promover @membro*\n` +
    `└ Promove o membro a administrador do grupo.\n\n` +
    `🔒 */despromover @membro*\n` +
    `└ Remove os privilégios de administrador do membro.\n\n` +
    `📢 */anunciar <texto>*\n` +
    `└ Envia um anúncio formatado e destacado no grupo.\n` +
    `└ Ex: */anunciar Reunião amanhã às 18h!*\n\n` +
    `⏰ */agendamento <tempo> <mensagem>*\n` +
    `└ Agenda uma mensagem para ser enviada após o tempo indicado.\n` +
    `└ Formatos: 10m, 2h, 1d.\n` +
    `└ Ex: */agendamento 1h Lembrete: reunião em breve!*\n\n` +
    `🚨 */denuncias*\n` +
    `└ Mostra as últimas 10 denúncias registadas no grupo com autor e mensagem reportada.`,

  config:
    `📖 *INSTRUÇÕES — Configuração*\n` +
    `_Configurar o comportamento do bot no grupo_\n\n` +
    `⚙️ */config*\n` +
    `└ Sem argumentos: mostra o estado actual de todas as configurações.\n` +
    `└ Com argumentos: altera uma configuração específica.\n` +
    `└ Opções disponíveis: spam, link, flood, welcome, warnings\n` +
    `└ Ex: */config spam off* — desactiva anti-spam\n` +
    `└ Ex: */config warnings 5* — define limite de avisos para 5\n` +
    `└ Ex: */config welcome on* — activa mensagem de boas-vindas\n\n` +
    `🔗 */antilink on|off*\n` +
    `└ Activa ou desactiva a detecção automática de links.\n` +
    `└ Quando activo: mensagem com link é apagada + aviso automático ao autor.\n` +
    `└ Detecta: http, https, www, bit.ly, t.me, wa.me.\n\n` +
    `🚫 */antispam on|off*\n` +
    `└ Activa ou desactiva a detecção de spam.\n` +
    `└ Detecta: texto todo em maiúsculas, caracteres repetidos, excesso de emojis.\n\n` +
    `🌊 */antiflood on|off*\n` +
    `└ Activa ou desactiva a detecção de flood (mensagens em excesso).\n` +
    `└ Limite padrão: 5 mensagens em 5 segundos.\n\n` +
    `📝 */setregras <texto>*\n` +
    `└ Define as regras personalizadas do grupo.\n` +
    `└ O texto é guardado no banco de dados e mostrado com /regras.\n` +
    `└ Ex: */setregras 1. Respeito mútuo 2. Sem spam 3. Sem links*\n\n` +
    `👋 */setwelcome <mensagem>*\n` +
    `└ Define a mensagem de boas-vindas para novos membros.\n` +
    `└ Variáveis disponíveis:\n` +
    `   • *{nome}* — substituído pelo nome do novo membro\n` +
    `   • *{grupo}* — substituído pelo nome do grupo\n` +
    `└ Ex: */setwelcome Olá {nome}, bem-vindo(a) ao {grupo}! Lê as /regras 📜*\n\n` +
    `🔔 */setadmingroup <ID do grupo principal>*\n` +
    `└ Configura este grupo como receptor de notificações de moderação.\n` +
    `└ Como usar:\n` +
    `   1. Cria um grupo privado com os admins + Orbis\n` +
    `   2. Nesse grupo, envia: */setadmingroup <ID>*\n` +
    `   3. O ID do grupo principal aparece no terminal ao enviar uma mensagem lá\n` +
    `└ Após configurado, avisos, denúncias e acções são enviados para este grupo.\n` +
    `└ Ex: */setadmingroup 120363427347409993@g.us*`,

  ia:
    `📖 *INSTRUÇÕES — Inteligência Artificial*\n` +
    `_Como interagir com a Orbis_\n\n` +
    `🤖 *Como activar a Orbis:*\n` +
    `└ Menciona @Orbis na mensagem\n` +
    `└ Escreve o nome *Orbis* em qualquer parte da mensagem\n` +
    `└ Responde directamente a uma mensagem da Orbis\n` +
    `└ Em mensagem privada (a Orbis responde sempre)\n\n` +
    `💬 *Conversa normal:*\n` +
    `└ Faz perguntas, pede opiniões, conversa livremente.\n` +
    `└ A Orbis lê o contexto da conversa e adapta o tom ao estado do grupo.\n` +
    `└ Distingue brincadeiras de situações sérias automaticamente.\n\n` +
    `👥 *Mencionar membros:*\n` +
    `└ _"Orbis chama o João"_ → menciona o João com notificação\n` +
    `└ _"Orbis chama toda a gente"_ → menciona todos os membros\n` +
    `└ _"Orbis fala com a Maria sobre a reunião"_ → dirige-se à Maria\n\n` +
    `🛡️ *Comandos por linguagem natural (só admins/owner):*\n` +
    `└ _"Orbis expulsa o Pedro"_ → executa kick\n` +
    `└ _"Orbis muta o Carlos por 30 minutos"_ → executa mute 30m\n` +
    `└ _"Orbis avisa o João por spam"_ → executa warn\n` +
    `└ _"Orbis bane o Rui por ameaças"_ → executa ban\n` +
    `└ _"Orbis tranca o grupo"_ → tranca o grupo\n` +
    `└ _"Orbis abre o grupo"_ → abre o grupo\n` +
    `└ _"Orbis promove o Miguel"_ → promove a admin\n` +
    `└ _"Orbis anuncia que a reunião é às 18h"_ → envia anúncio\n` +
    `└ _"Orbis faz sondagem: Melhor dia? | Segunda | Terça"_ → cria enquete\n\n` +
    `🤖 *Moderação autónoma (age sozinha):*\n` +
    `└ Monitoriza todas as mensagens do grupo em tempo real.\n` +
    `└ Age automaticamente em casos de:\n` +
    `   • Insultos e linguagem ofensiva\n` +
    `   • Ameaças directas\n` +
    `   • Discurso de ódio\n` +
    `   • Conteúdo sexual inapropriado\n` +
    `   • Spam e desrespeito persistente\n` +
    `└ Admins e owners *nunca* são moderados automaticamente.\n` +
    `└ Punições progressivas por reincidência:\n` +
    `   1º strike → aviso\n` +
    `   2º strike → mute temporário\n` +
    `   3-4º strike → mute prolongado\n` +
    `   5º+ strike → expulsão ou ban\n` +
    `└ Analisa contexto completo — brincadeiras entre amigos não são violações.\n` +
    `└ Threshold de confiança alto — em caso de dúvida, não age.`
}

registerCommand('instrucoes', { description: 'Instruções detalhadas de todos os comandos', permission: 'member' }, async ({ sock, groupId, msg, args }) => {
  const cmd = args[0]?.toLowerCase()

  const index =
    `📖 *INSTRUÇÕES — ORBIS*\n` +
    `_by Orion Technologies_\n\n` +
    `Escolhe uma secção para ver as instruções detalhadas:\n\n` +
    `📋 */instrucoes geral* — Comandos para todos os membros\n` +
    `🛡️ */instrucoes moderacao* — Moderação e punições (admins)\n` +
    `⚙️ */instrucoes config* — Configuração do bot no grupo\n` +
    `🤖 */instrucoes ia* — Como usar a Inteligência Artificial\n\n` +
    `_Exemplo: /instrucoes moderacao_`

  await sock.sendMessage(groupId, { text: PAGES[cmd] || index, quoted: msg })
})
