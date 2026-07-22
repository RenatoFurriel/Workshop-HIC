/**
 * Agente de limpeza da base de leads — Workshop O Novo Profissional de GRC TI (ITXPRO)
 * ---------------------------------------------------------------------------------
 * Roda DENTRO da planilha do Respondi (Extensões > Apps Script), preso à aba "Respostas".
 * A cada execução varre a base e PINTA DE VERMELHO o que precisa sair — nunca apaga nada.
 * A exclusão continua sendo decisão humana; a aba "Dash" acompanha via QUERY.
 *
 * O que marca (a planilha INTEIRA, inclusive alunos):
 *   1. Duplicados — mesma pessoa por E-MAIL OU WHATSAPP (normalizados). Mantém 1 linha
 *      canônica (a mais completa; empate = mais recente) e pinta as demais. Vale para
 *      todo mundo: cadastro duplicado de aluno também é pintado.
 *   2. Formulário em branco — linha só com UTM/tracking, sem nenhuma resposta do form.
 *
 * Segurança: cada execução limpa a marcação que o PRÓPRIO agente pôs antes (rastreada
 * pela coluna "Limpeza") e remarca do zero — não acumula e preserva formatação manual.
 *
 * Instalação: cole este arquivo no Apps Script da planilha, salve, rode uma vez
 * `instalarGatilho` (autorize quando pedir). Pronto: roda sozinho no intervalo abaixo.
 * Para varrer na hora, use o menu "🧹 Limpeza" > "Varrer agora".
 */

// ===================== CONFIG (ajuste aqui) =====================
var CONFIG = {
  ABA_DADOS: 'Respostas',        // aba com os leads (tem e-mail/WhatsApp)
  ABA_LOG:   'Log Limpeza',      // criada sozinha se não existir
  COL_LIMPEZA: 'Limpeza',        // coluna de status criada sozinha à direita
  FREQUENCIA_HORAS: 1,           // de quanto em quanto tempo varre (gatilho de tempo)
  AVISAR_EMAIL: '',              // e-mail p/ resumo (deixe '' para não enviar). Ex.: 'renato.furriel@conexaoarteiro.com.br'
  COR_MARCA: '#F8C9C0',          // vermelho suave do destaque (legível no claro/escuro)
  // palavras-chave p/ achar colunas (sem acento, minúsculo) — robusto a reordenação:
  KW_EMAIL:    ['e-mail', 'email', 'e mail'],
  KW_WHATSAPP: ['whatsapp', 'whats', 'telefone', 'celular', 'contato'],
  // colunas que NÃO contam como "resposta do formulário" (p/ detectar linha em branco):
  KW_NAO_FORM: ['data', 'id', 'pontua', 'utm_', 'gclid', 'fbclid', 'carimbo', 'timestamp']
};

// ===================== helpers =====================
function _norm(s){
  return (s == null ? '' : s.toString())
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim();
}
function _normEmail(s){ return _norm(s).replace(/\s+/g, ''); }
function _normFone(s){ return (s == null ? '' : s.toString()).replace(/\D/g, '').replace(/^0+/, ''); }
function _achaCol(headers, kws){
  for (var i = 0; i < headers.length; i++){
    var h = _norm(headers[i]);
    for (var k = 0; k < kws.length; k++){ if (h.indexOf(kws[k]) >= 0) return i; }
  }
  return -1;
}
function _ehColNaoForm(header){
  var h = _norm(header);
  for (var i = 0; i < CONFIG.KW_NAO_FORM.length; i++){ if (h.indexOf(CONFIG.KW_NAO_FORM[i]) >= 0) return true; }
  return false;
}

// ===================== núcleo =====================
function varrerBase(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.ABA_DADOS);
  if (!sh){ throw new Error('Aba "' + CONFIG.ABA_DADOS + '" não encontrada.'); }

  var ultLin = sh.getLastRow(), ultCol = sh.getLastColumn();
  if (ultLin < 2){ return {dups: 0, vazios: 0, total: 0}; }

  var headers = sh.getRange(1, 1, 1, ultCol).getValues()[0];

  // garante a coluna "Limpeza" (cria à direita se faltar)
  var idxLimpeza = _achaCol(headers, [_norm(CONFIG.COL_LIMPEZA)]);
  if (idxLimpeza < 0){
    idxLimpeza = ultCol;                       // 0-based da nova coluna
    sh.getRange(1, ultCol + 1).setValue(CONFIG.COL_LIMPEZA);
    ultCol = ultCol + 1;
    headers = sh.getRange(1, 1, 1, ultCol).getValues()[0];
  }

  var nLin = ultLin - 1;
  var dados = sh.getRange(2, 1, nLin, ultCol).getValues();

  var iEmail = _achaCol(headers, CONFIG.KW_EMAIL);
  var iFone  = _achaCol(headers, CONFIG.KW_WHATSAPP);
  var colsForm = [];
  for (var c = 0; c < headers.length; c++){ if (c !== idxLimpeza && !_ehColNaoForm(headers[c])) colsForm.push(c); }

  // ---- 1) reset: só as linhas que o agente marcou antes (têm texto na col Limpeza) ----
  var fundoAtual = sh.getRange(2, 1, nLin, ultCol).getBackgrounds();
  for (var r = 0; r < nLin; r++){
    if (_norm(dados[r][idxLimpeza]) !== ''){
      for (var cc = 0; cc < ultCol; cc++){ fundoAtual[r][cc] = null; } // volta ao padrão
      dados[r][idxLimpeza] = '';
    }
  }

  // ---- 2) detecção ----
  var motivo = new Array(nLin); // string por linha (ou undefined)

  // 2a. formulário em branco (planilha inteira, sem exceção)
  for (var r2 = 0; r2 < nLin; r2++){
    var preenchidos = 0;
    for (var f = 0; f < colsForm.length; f++){ if (_norm(dados[r2][colsForm[f]]) !== '') preenchidos++; }
    if (preenchidos === 0) motivo[r2] = 'formulário em branco';
  }

  // 2b. duplicados por e-mail OU whatsapp (union-find leve por chave)
  // mapa chave -> lista de índices; uma linha pode ligar 2 chaves (email e fone)
  var grupos = {};       // idGrupo -> [indices]
  var chaveGrupo = {};   // chave normalizada -> idGrupo
  var linhaGrupo = {};   // indice -> idGrupo
  var seqGrupo = 0;
  function _ligar(idx, chave){
    if (!chave) return;
    if (chaveGrupo[chave] != null){
      var g = chaveGrupo[chave];
      if (linhaGrupo[idx] == null){ linhaGrupo[idx] = g; grupos[g].push(idx); }
      else if (linhaGrupo[idx] !== g){ // funde os dois grupos
        var gA = linhaGrupo[idx], gB = g;
        grupos[gB].forEach(function(i){ if (grupos[gA].indexOf(i) < 0){ grupos[gA].push(i); } linhaGrupo[i] = gA; });
        Object.keys(chaveGrupo).forEach(function(k){ if (chaveGrupo[k] === gB) chaveGrupo[k] = gA; });
        grupos[gB] = [];
      }
    } else {
      if (linhaGrupo[idx] == null){ linhaGrupo[idx] = ++seqGrupo; grupos[seqGrupo] = [idx]; }
      chaveGrupo[chave] = linhaGrupo[idx];
    }
  }
  for (var r3 = 0; r3 < nLin; r3++){
    if (motivo[r3] === 'formulário em branco') continue; // já sai; não entra em dedup
    var em = iEmail >= 0 ? _normEmail(dados[r3][iEmail]) : '';
    var fo = iFone  >= 0 ? _normFone(dados[r3][iFone])  : '';
    if (em) _ligar(r3, 'e:' + em);
    if (fo && fo.length >= 8) _ligar(r3, 'w:' + fo);
  }

  // p/ cada grupo com 2+ linhas: escolhe canônica (mais completa; empate = mais recente = maior nº de linha)
  function _completude(idx){
    var n = 0; for (var f = 0; f < colsForm.length; f++){ if (_norm(dados[idx][colsForm[f]]) !== '') n++; } return n;
  }
  Object.keys(grupos).forEach(function(gid){
    var membros = grupos[gid];
    if (!membros || membros.length < 2) return;
    var canon = membros[0];
    membros.forEach(function(i){
      var mc = _completude(i), cc = _completude(canon);
      if (mc > cc || (mc === cc && i > canon)) canon = i;
    });
    membros.forEach(function(i){
      if (i !== canon && !motivo[i]) motivo[i] = 'duplicado da linha ' + (canon + 2);
    });
  });

  // ---- 3) aplica marcação (cor + coluna Limpeza) ----
  var dups = 0, vazios = 0;
  for (var r4 = 0; r4 < nLin; r4++){
    if (!motivo[r4]) continue;
    for (var cc2 = 0; cc2 < ultCol; cc2++){ fundoAtual[r4][cc2] = CONFIG.COR_MARCA; }
    dados[r4][idxLimpeza] = motivo[r4];
    if (motivo[r4].indexOf('duplicado') === 0) dups++; else vazios++;
  }

  sh.getRange(2, 1, nLin, ultCol).setBackgrounds(fundoAtual);
  sh.getRange(2, idxLimpeza + 1, nLin, 1).setValues(dados.map(function(row){ return [row[idxLimpeza]]; }));

  var resumo = {dups: dups, vazios: vazios, total: nLin};
  _registrarLog(ss, resumo);
  if (CONFIG.AVISAR_EMAIL && (dups + vazios) > 0) _avisar(resumo);
  return resumo;
}

function _registrarLog(ss, resumo){
  var log = ss.getSheetByName(CONFIG.ABA_LOG);
  if (!log){ log = ss.insertSheet(CONFIG.ABA_LOG); log.appendRow(['Quando', 'Duplicados', 'Em branco', 'Total varrido']); }
  log.appendRow([new Date(), resumo.dups, resumo.vazios, resumo.total]);
}

function _avisar(resumo){
  MailApp.sendEmail(CONFIG.AVISAR_EMAIL,
    '[Leads] Limpeza: ' + (resumo.dups + resumo.vazios) + ' linha(s) para revisar',
    'Varredura da base "' + CONFIG.ABA_DADOS + '":\n\n' +
    '• Duplicados: ' + resumo.dups + '\n' +
    '• Formulário em branco: ' + resumo.vazios + '\n' +
    '• Total varrido: ' + resumo.total + '\n\n' +
    'As linhas estão pintadas de vermelho na planilha, com o motivo na coluna "' + CONFIG.COL_LIMPEZA + '". ' +
    'Revise e apague as que confirmar (a aba Dash acompanha sozinha).');
}

// ===================== instalação / menu =====================
function instalarGatilho(){
  ScriptApp.getProjectTriggers().forEach(function(t){
    if (t.getHandlerFunction() === 'varrerBase') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('varrerBase').timeBased().everyHours(CONFIG.FREQUENCIA_HORAS).create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Gatilho criado: varre a cada ' + CONFIG.FREQUENCIA_HORAS + 'h.');
}

function onOpen(){
  SpreadsheetApp.getUi().createMenu('🧹 Limpeza')
    .addItem('Varrer agora', 'varrerAgora')
    .addItem('Instalar/atualizar gatilho automático', 'instalarGatilho')
    .addToUi();
}

function varrerAgora(){
  var r = varrerBase();
  SpreadsheetApp.getActiveSpreadsheet().toast(
    'Marcados: ' + r.dups + ' duplicado(s), ' + r.vazios + ' em branco. Total: ' + r.total + '.', 'Limpeza', 8);
}
