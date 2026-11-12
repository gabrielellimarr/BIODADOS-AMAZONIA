/* =====================================================================
   Bio Dados Amazônia · app.js
   ---------------------------------------------------------------------
   DE ONDE VÊM OS DADOS
   O site lê três tabelas CSV. Por padrão, os arquivos da pasta /dados.
   Para alimentar a base por uma planilha Google (recomendado para a
   equipe): crie uma planilha com três abas (especies, moleculas,
   registros), use Arquivo > Compartilhar > Publicar na Web, publique
   cada aba como CSV e cole os três links abaixo no lugar dos caminhos.
   ===================================================================== */
const FONTES = {
  especies:  'dados/especies.csv',
  moleculas: 'dados/moleculas.csv',
  registros: 'dados/registros.csv'
};

const SITE = { nome: 'Bio Dados Amazônia', subtitulo: 'banco digital de Roraima' };

const IBGE_MALHA = 'https://servicodados.ibge.gov.br/api/v3/malhas/estados/14?intrarregiao=municipio&formato=application/vnd.geo+json&qualidade=intermediaria';
const IBGE_CENSO = 'https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis?localidades=N6[N3[14]]';
const EOX = 'https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg';
const EOX_ATR = 'Sentinel-2 cloudless © EOX, dados Copernicus Sentinel 2020, CC BY-NC-SA 4.0 | Limites: IBGE';
const GBIF = 'https://api.gbif.org/v1';

const MUN = {1400027:'Amajari',1400050:'Alto Alegre',1400100:'Boa Vista',1400159:'Bonfim',1400175:'Cantá',1400209:'Caracaraí',1400233:'Caroebe',1400282:'Iracema',1400308:'Mucajaí',1400456:'Normandia',1400472:'Pacaraima',1400506:'Rorainópolis',1400605:'São João da Baliza',1400704:'São Luiz',1400754:'Uiramutã'};

const GRUPOS = {
  animais:{rot:'Animais peçonhentos',sing:'animal peçonhento',intro:'Serpentes e outros animais peçonhentos da base, com as moléculas da peçonha descritas na literatura.'},
  plantas:{rot:'Plantas medicinais',sing:'planta medicinal',intro:'Plantas da base com compostos bioativos descritos na literatura.'},
  fungos:{rot:'Fungos',sing:'fungo',intro:'Fungos de interesse medicinal e toxicológico, com compostos bioativos descritos na literatura.'}
};
const GRAUS = {
  A:{rot:'Grau A',txt:'literatura revisada por pares, evidência robusta'},
  B:{rot:'Grau B',txt:'indicado na literatura, evidência preliminar'},
  C:{rot:'Grau C',txt:'conhecimento popular ou tradicional'},
  '0':{rot:'Não classificado',txt:'grau de evidência ainda não atribuído'}
};
const ORDEM_GRAU = {A:3,B:2,C:1,'0':0};

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const es = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fm = n => Number(n).toLocaleString('pt-BR');
const sem = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = s => sem(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const lista = s => String(s || '').split(';').map(x => x.trim()).filter(Boolean);
const vazio = s => !String(s ?? '').trim();
const naoTranscrito = s => vazio(s) || /n[aã]o transcrito/i.test(s);
const fetchJSON = async u => { const r = await fetch(u); if (!r.ok) throw new Error(r.status); return r.json(); };
function toast(t){ const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200); }
function carregarScript(u){ return new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
const temLeaflet = () => typeof window.L !== 'undefined';

/* ---------- CSV ---------- */
// Aceita vírgula ou ponto e vírgula (Excel em português salva com ";").
function lerCSV(t){
  t = String(t || '').replace(/^\uFEFF/, '').trim();
  if (!t) return [];
  const primeira = t.split(/\r?\n/, 1)[0];
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas = []; let linha = [], campo = '', aspas = false;
  for (let i = 0; i < t.length; i++){
    const c = t[i];
    if (aspas){
      if (c === '"'){ if (t[i+1] === '"'){ campo += '"'; i++; } else aspas = false; }
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep){ linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r'){ if (c === '\r' && t[i+1] === '\n') i++; linha.push(campo); linhas.push(linha); linha = []; campo = ''; }
    else campo += c;
  }
  linha.push(campo); linhas.push(linha);
  const cab = linhas.shift().map(h => sem(h).trim().replace(/\s+/g, '_'));
  return linhas.filter(l => l.some(x => x.trim())).map(l => Object.fromEntries(cab.map((h, i) => [h, (l[i] ?? '').trim()])));
}
function paraCSV(linhas, colunas){
  const q = v => { v = String(v ?? ''); return /[",;\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return '\uFEFF' + [colunas.join(','), ...linhas.map(l => colunas.map(c => q(l[c])).join(','))].join('\r\n');
}
function baixar(nome, texto){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], {type:'text/csv;charset=utf-8'}));
  a.download = nome; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/* ---------- modelo de dados ---------- */
let E = [], ESP = {}, MOL = {}, R = [], ORIGEM = {};
const tipoDe = e => /fung/i.test(e.grupo) ? 'fungos' : /anim/i.test(e.grupo) ? 'animais' : 'plantas';
const melhorGrau = regs => regs.reduce((m, r) => ORDEM_GRAU[r.grau] > ORDEM_GRAU[m] ? r.grau : m, '0');

async function carregar(nome){
  try {
    const r = await fetch(FONTES[nome], {cache:'no-cache'});
    if (!r.ok) throw 0;
    const dados = lerCSV(await r.text());
    if (!dados.length) throw 0;
    ORIGEM[nome] = 'arquivo';
    return dados;
  } catch (e) {
    ORIGEM[nome] = 'embutido';
    return lerCSV($('#csv-' + nome).textContent);
  }
}

function montar(esp, mol, reg){
  MOL = {}; mol.forEach(m => { m.id = m.id || slug(m.nome); if (m.id) MOL[m.id] = m; });
  ESP = {};
  E = esp.filter(e => e.nome_cientifico).map(e => { e.id = e.id || slug(e.nome_cientifico); e.reg = []; ESP[e.id] = e; return e; });
  R = reg.filter(r => r.especie_id || r.organismo).map((r, i) => {
    r.id = r.id || 'R' + String(i + 1).padStart(3, '0');
    r.especie_id = r.especie_id || slug(r.organismo);
    let e = ESP[r.especie_id];
    if (!e){ // registro de espécie que ainda não está em especies.csv
      e = { id:r.especie_id, nome_cientifico:r.organismo || r.especie_id.replace(/-/g,' ').replace(/^./, c => c.toUpperCase()), grupo:r.grupo || '', reg:[], _incompleta:true };
      ESP[e.id] = e; E.push(e);
    }
    const g = String(r.grau || '').trim().toUpperCase();
    r.grau = GRAUS[g] && g !== '0' ? g : '0';
    r.municipio_ibge = r.municipio_ibge ? +r.municipio_ibge : null;
    r.lat = r.latitude ? +String(r.latitude).replace(',', '.') : null;
    r.lon = r.longitude ? +String(r.longitude).replace(',', '.') : null;
    r.molecula_id = r.molecula_id || (MOL[slug(r.molecula)] ? slug(r.molecula) : '');
    r.esp = e; e.reg.push(r);
    return r;
  });
  E.sort((a, b) => a.nome_cientifico.localeCompare(b.nome_cientifico));
  E.forEach(e => { e.tipo = tipoDe(e); e.grauMax = melhorGrau(e.reg); e.muns = [...new Set(e.reg.map(r => r.municipio_ibge).filter(Boolean))]; });
}

/* ---------- pequenos componentes ---------- */
const selo = g => `<span class="grau grau-${g}" title="${es(GRAUS[g].txt)}">${g === '0' ? 'Não classificado' : `<b>${g}</b> ${GRAUS[g].txt.split(',')[0]}`}</span>`;
const miniatura = e => e.foto
  ? `<img class="miniatura" src="${es(e.foto)}" alt="" loading="lazy">`
  : `<span class="monograma" aria-hidden="true">${es(e.nome_cientifico.split(' ').map(p => p[0]).join('').slice(0,2))}</span>`;
const nRegistros = n => n === 1 ? '1 registro' : `${n} registros`;
const nEspecies = n => n === 1 ? '1 espécie' : `${n} espécies`;
const linkDOI = d => { d = String(d || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim(); return d ? `<a href="https://doi.org/${es(d)}" target="_blank" rel="noopener">doi:${es(d)}</a>` : ''; };

function linhaIndice(e, extra = ''){
  const n = e.reg.length;
  const meta = [e.nome_popular, e.familia].filter(Boolean).map(es);
  return `<li data-q="${es(sem([e.nome_cientifico, e.nome_popular, e.outros_nomes, e.familia, ...e.reg.map(r => r.molecula + ' ' + r.atividade)].join(' ')))}">
    <a href="#especie/${es(e.id)}">${miniatura(e)}
      <span><span class="nome bin">${es(e.nome_cientifico)}</span>${e.autoria ? `<span class="aut">${es(e.autoria)}</span>` : ''}
        <span class="meta">${meta.map(m => `<span>${m}</span>`).join('') || '<span>Nome popular não informado</span>'}${extra}</span></span>
      <span class="lado"><span>${nRegistros(n)}</span>${selo(e.grauMax)}</span>
    </a></li>`;
}

/* =====================================================================
   ROTAS
   ===================================================================== */
const VISAO_DO_MENU = { inicio:'inicio', animais:'animais', plantas:'plantas', fungos:'fungos', usos:'usos', conexao:'conexao', busca:'busca', contribuir:'contribuir', autoria:'autoria' };
function rota(){
  let h = decodeURIComponent((location.hash || '#inicio').slice(1));
  if (h === 'home') h = 'inicio';
  const [v, ...resto] = h.split('/'); const arg = resto.join('/');
  $$('.visao').forEach(s => s.classList.remove('ativa'));
  $('#menu').classList.remove('aberto'); $('#abrir-menu').setAttribute('aria-expanded', 'false');
  let marcar = VISAO_DO_MENU[v] || 'inicio';
  if (v === 'especie'){ const e = ESP[arg]; marcar = e ? e.tipo : ''; $('#v-especie').classList.add('ativa'); mostrarEspecie(arg); }
  else if (GRUPOS[v]){ mostrarLista(v); $('#v-lista').classList.add('ativa'); }
  else if (v === 'usos'){ mostrarUsos(arg); $('#v-usos').classList.add('ativa'); }
  else if (v === 'conexao'){ $('#v-conexao').classList.add('ativa'); desenharConexao(); }
  else if (v === 'busca'){ $('#v-busca').classList.add('ativa'); $('#q-busca').value = arg; buscar(arg); if (!arg) $('#q-busca').focus(); }
  else if (v === 'contribuir'){ mostrarContribuir(); $('#v-contribuir').classList.add('ativa'); }
  else if (v === 'autoria'){ mostrarAutoria(); $('#v-autoria').classList.add('ativa'); }
  else { $('#v-inicio').classList.add('ativa'); iniciarMapa(); setTimeout(() => mapa && mapa.invalidateSize(), 60); }
  $$('#menu a').forEach(a => a.dataset.v === marcar ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'));
  const t = { especie: ESP[arg] ? ESP[arg].nome_cientifico : 'Espécie', usos:'Usos', conexao:'Conexão', busca:'Buscar', contribuir:'Contribuir', autoria:'Autoria' }[v] || (GRUPOS[v] && GRUPOS[v].rot);
  document.title = t ? `${t} | ${SITE.nome}` : `${SITE.nome} · Roraima`;
  if (v !== 'busca') scrollTo(0, 0);
}

/* =====================================================================
   INÍCIO
   ===================================================================== */
function mostrarSecoes(){
  const c = k => E.filter(e => e.tipo === k).length;
  const ativ = new Set(R.map(r => r.atividade)).size;
  const itens = [
    ['#animais', 'Animais peçonhentos', nEspecies(c('animais')), 'Serpentes e outros animais, com as moléculas da peçonha.'],
    ['#plantas', 'Plantas medicinais', nEspecies(c('plantas')), 'Espécies e compostos bioativos descritos.'],
    ['#fungos', 'Fungos', nEspecies(c('fungos')), 'Fungos de interesse medicinal e toxicológico.'],
    ['#usos', 'Usos', ativ === 1 ? '1 atividade' : `${ativ} atividades`, 'Atividades biológicas e as espécies em que foram descritas.'],
    ['#conexao', 'Conexão', nRegistros(R.length), 'O caminho de cada espécie até a molécula, a classe e a atividade.'],
    ['#contribuir', 'Contribuir', 'para a equipe', 'Como alimentar a base, dicionário de dados e pendências.']
  ];
  $('#secoes').innerHTML = itens.map(([h, t, n, d]) => `<a href="${h}"><h3>${t}<span>${n}</span></h3><p>${d}</p></a>`).join('');
}

let mapa = null, camada = null, selMun = null, feicoes = {}, censo = {}, MALHA = null;
function malha(){ return MALHA || (MALHA = fetchJSON(IBGE_MALHA).catch(e => { MALHA = null; throw e; })); }
const espDoMun = c => E.filter(e => e.muns.includes(c));

function iniciarMapa(){
  if (mapa || !temLeaflet()){ if (!temLeaflet()) $('#mapa').innerHTML = '<p style="padding:1.2rem;color:#A6BCB3">O mapa não pôde ser carregado. Verifique a conexão com a internet.</p>'; painel(); return; }
  mapa = L.map('mapa', {zoomSnap:.25, minZoom:5, scrollWheelZoom:false}).setView([2.1, -61.4], 6.5);
  L.tileLayer(EOX, {attribution:EOX_ATR, maxZoom:13}).addTo(mapa);
  malha().then(desenharMalha).catch(() => {
    $('#mapa').insertAdjacentHTML('beforeend', '<div style="position:absolute;left:1rem;right:1rem;bottom:2.5rem;z-index:500;background:#2A2412;color:#E9D9B5;padding:.8rem;border-radius:6px;font-size:.85rem">Não foi possível obter a malha municipal do IBGE. Verifique a conexão ou carregue um GeoJSON: <input type="file" accept=".json,.geojson" id="gj"></div>');
    $('#gj').onchange = ev => ev.target.files[0].text().then(t => { const g = JSON.parse(t); MALHA = Promise.resolve(g); desenharMalha(g); });
  });
  fetchJSON(IBGE_CENSO).then(v => { v.forEach(x => { const k = /popula/i.test(x.variavel) ? 'pop' : /rea da/i.test(x.variavel) ? 'area' : null;
    if (k) x.resultados[0].series.forEach(s => { (censo[s.localidade.id] = censo[s.localidade.id] || {})[k] = +String(Object.values(s.serie)[0]).replace(',', '.'); }); }); painel(); }).catch(() => {});
  const ctl = new L.Control({position:'topleft'});
  ctl.onAdd = () => { const b = L.DomUtil.create('button', 'btn-mapa'); b.type = 'button'; b.textContent = 'Ver Roraima inteiro'; L.DomEvent.on(b, 'click', ev => { L.DomEvent.stop(ev); escolherMun(null); }); return b; };
  ctl.addTo(mapa);
}
function estiloMun(l){
  const c = +l.feature.properties.codarea, on = c === selMun, tem = espDoMun(c).length;
  l.setStyle({color:on ? '#FFE08A' : '#E8F5EC', weight:on ? 3 : 1, fillColor:on ? '#C8913A' : tem ? '#2E6B3F' : '#0F3A33', fillOpacity:on ? .3 : tem ? .22 : .05, opacity:on ? 1 : .55});
}
function desenharMalha(g){
  camada = L.geoJSON(g, {onEachFeature:(f, l) => {
    const c = +f.properties.codarea; feicoes[c] = l;
    l.bindTooltip(() => { const n = espDoMun(c).length; return `${es(MUN[c] || c)}<br>${n ? nEspecies(n) + ' na base' : 'sem registros na base'}`; }, {className:'dica', sticky:true});
    l.on({mouseover:() => l.setStyle({weight:2.5, color:'#fff'}), mouseout:() => estiloMun(l), click:() => escolherMun(c)});
  }}).addTo(mapa);
  camada.eachLayer(estiloMun);
  mapa.fitBounds(camada.getBounds(), {padding:[20, 20]});
  camada.eachLayer(l => { const c = +l.feature.properties.codarea, n = espDoMun(c).length;
    L.marker(l.getBounds().getCenter(), {interactive:false, icon:L.divIcon({className:'', html:`<span class="pino${n ? '' : ' vazio'}">${n || '·'}</span>`, iconSize:[0, 0]})}).addTo(mapa); });
}
function escolherMun(c){
  selMun = c;
  $$('#municipios button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.c === c)));
  if (camada){ camada.eachLayer(estiloMun);
    if (c && feicoes[c]) mapa.flyToBounds(feicoes[c].getBounds(), {padding:[30, 30], duration:.7});
    else mapa.flyToBounds(camada.getBounds(), {padding:[20, 20], duration:.7}); }
  painel();
}
function painel(){
  const s = $('#painel'), comMun = E.filter(e => e.muns.length).length;
  if (!selMun){
    const c = k => E.filter(e => e.tipo === k).length;
    s.innerHTML = `<span class="rotulo">Visão geral</span><h3>Roraima</h3>
      <div class="linha">Municípios<b>15</b></div>
      <div class="linha">Espécies na base<b>${E.length}</b></div>
      <div class="linha">Animais peçonhentos<b>${c('animais')}</b></div>
      <div class="linha">Plantas medicinais<b>${c('plantas')}</b></div>
      <div class="linha">Fungos<b>${c('fungos')}</b></div>
      <div class="linha">Espécies com município registrado<b>${comMun}</b></div>
      <p class="nota">Os números nos municípios contam espécies com registro municipal na base. Município sem número não significa ausência da espécie, apenas ausência de registro.</p>
      <p style="color:#8FA9A0;font-size:.9rem;margin:0">Toque em um município no mapa ou na lista abaixo.</p>`;
    return;
  }
  const i = censo[selMun] || {}, lst = espDoMun(selMun);
  s.innerHTML = `<span class="rotulo">Município de Roraima</span><h3>${es(MUN[selMun])}</h3>
    <div class="linha">Código IBGE<b>${selMun}</b></div>
    <div class="linha">Área (km²)<b>${i.area ? fm(i.area) : '—'}</b></div>
    <div class="linha">População (2022)<b>${i.pop ? fm(i.pop) : '—'}</b></div>
    <div class="linha">Densidade (hab./km²)<b>${i.pop && i.area ? (i.pop / i.area).toFixed(2).replace('.', ',') : '—'}</b></div>
    <span class="fonte">Fonte: IBGE, Censo 2022 (SIDRA, tabela 4714)${i.pop ? '' : '. Indisponível sem conexão.'}</span>
    <div style="margin-top:1.3rem"><span class="rotulo">${lst.length ? nEspecies(lst.length) + ' com registro neste município' : 'Nenhuma espécie com registro neste município'}</span>
    ${lst.map(e => `<a class="esp" href="#especie/${es(e.id)}"><span class="bin">${es(e.nome_cientifico)}</span><small>${es(e.nome_popular || GRUPOS[e.tipo].sing)}</small></a>`).join('')}</div>
    ${lst.length ? '' : `<p class="nota">A ausência de registro na base não indica ausência das espécies em ${es(MUN[selMun])}.</p>`}
    <button class="voltar" type="button" data-acao="roraima">Voltar para Roraima</button>`;
}

/* =====================================================================
   ÍNDICE DE ESPÉCIES
   ===================================================================== */
function mostrarLista(k){
  const G = GRUPOS[k], L_ = E.filter(e => e.tipo === k);
  $('#lista').innerHTML = `<div class="cab-visao"><h1>${G.rot}</h1><p class="leve">${G.intro}</p></div>
    ${L_.length ? `<div class="filtro"><label class="sr" for="f-lista">Filtrar</label><input id="f-lista" type="search" placeholder="Filtrar por nome, família, molécula…" autocomplete="off"><span class="cont" id="cont-lista">${nEspecies(L_.length)}</span>
      <button class="botao" type="button" data-baixar="${k}">Baixar registros (CSV)</button></div>
      <ol class="indice" id="ind-lista">${L_.map(e => linhaIndice(e)).join('')}</ol>`
    : `<div class="vazio-box"><h3>Nenhuma espécie cadastrada ainda</h3><p>Esta seção está pronta para receber registros. Para incluir ${G.rot.toLowerCase()}, adicione as espécies em <span class="cod">especies.csv</span> com o grupo “${G.sing}”. A ausência de registros na base não indica ausência dessas espécies na região.</p><a class="botao" href="#contribuir">Ver como contribuir</a></div>`}`;
  const f = $('#f-lista');
  if (f) f.oninput = () => { const q = sem(f.value).trim(); let n = 0;
    $$('#ind-lista li').forEach(li => { const ok = !q || li.dataset.q.includes(q); li.hidden = !ok; n += ok; });
    $('#cont-lista').textContent = q ? `${n} de ${nEspecies(L_.length)}` : nEspecies(L_.length); };
}

/* =====================================================================
   FICHA DA ESPÉCIE
   ===================================================================== */
let mapaEsp = null, visor = null, girando = true;

function mostrarEspecie(id){
  const e = ESP[id], alvo = $('#especie');
  if (mapaEsp){ mapaEsp.remove(); mapaEsp = null; } visor = null;
  if (!e){ alvo.innerHTML = `<div class="cab-visao"><h1>Espécie não encontrada</h1><p class="leve">O endereço não corresponde a nenhuma espécie da base. Ela pode ter sido renomeada.</p><a class="botao" href="#busca">Buscar na base</a></div>`; return; }
  const G = GRUPOS[e.tipo], m = MOL[e.molecula_destaque], nomes = lista(e.outros_nomes), subs = lista(e.subespecies);
  const taxo = [['Reino', e.reino], ['Filo', e.filo], ['Classe', e.classe], ['Ordem', e.ordem], ['Família', e.familia], ['Gênero', e.genero]].filter(x => x[1]);
  const regMun = e.reg.filter(r => r.municipio_ibge);

  alvo.innerHTML = `
  <nav class="migalha" aria-label="Você está em"><a href="#${e.tipo}">${G.rot}</a></nav>
  <div class="ficha">
    ${e.foto ? `<figure class="foto"><img src="${es(e.foto)}" alt="Fotografia de ${es(e.nome_cientifico)}"><figcaption>Foto: ${es(e.foto_credito || 'crédito a registrar')}${e.foto_licenca ? `. Licença: ${es(e.foto_licenca)}` : ''}</figcaption></figure>`
      : `<div class="foto-vazia"><div><span class="bin">${es(e.nome_cientifico)}</span>Fotografia a ser incorporada com autorização e crédito.</div></div>`}
    <div class="etiqueta">
      <div class="col"><span>${SITE.nome}</span><span>${G.rot}</span></div>
      <h1>${es(e.nome_cientifico)}${e.autoria ? `<span class="autoria">${es(e.autoria)}</span>` : ''}</h1>
      <p class="popular">${es(e.nome_popular || 'Nome popular não informado')}</p>
      <dl class="campos">
        ${e.familia ? `<dt>Família</dt><dd>${es(e.familia)}</dd>` : ''}
        ${e.ordem ? `<dt>Ordem</dt><dd>${es(e.ordem)}</dd>` : ''}
        <dt>Evidência</dt><dd>${selo(e.grauMax)}</dd>
        ${e.status_conservacao ? `<dt>Conservação</dt><dd>${es(e.status_conservacao)}</dd>` : ''}
        <dt>Em Roraima</dt><dd>${e.muns.length ? e.muns.map(c => es(MUN[c] || c)).join(', ') : 'Município não registrado na base'}</dd>
      </dl>
      <div class="numeros">
        <div><b>${e.reg.length}</b><span>${e.reg.length === 1 ? 'registro' : 'registros'} na base</span></div>
        <div><b id="n-br">${e.ocorrencias_gbif_brasil ? fm(e.ocorrencias_gbif_brasil) : '—'}</b><span>ocorrências GBIF no Brasil</span></div>
        <div><b id="n-rr">…</b><span>ocorrências GBIF em Roraima</span></div>
      </div>
      <div class="acoes">
        <button class="botao prim" type="button" data-citar="${es(e.id)}">Como citar</button>
        <button class="botao" type="button" data-baixar="esp:${es(e.id)}">Baixar registros (CSV)</button>
        <a class="botao" id="lk-gbif" href="https://www.gbif.org/search?q=${encodeURIComponent(e.nome_cientifico)}" target="_blank" rel="noopener">Ver no GBIF</a>
      </div>
    </div>
  </div>

  ${e.descricao || nomes.length || subs.length || taxo.length ? `<section class="bloco"><header><h2>Descrição</h2></header><div class="texto-longo">
    ${e.descricao ? `<p>${es(e.descricao)}</p>` : '<p class="mudo">Descrição ainda não cadastrada.</p>'}
    ${nomes.length ? `<p class="mudo" style="font-size:.95rem">Também conhecida como ${es(nomes.join(', '))}.</p>` : ''}
    ${subs.length ? `<p style="margin:1.2rem 0 0;font-size:.92rem" class="mudo">Subespécies</p><ul class="pilulas">${subs.map(s => `<li class="bin">${es(s)}</li>`).join('')}</ul>` : ''}
    ${taxo.length ? `<table class="taxo"><caption class="sr">Classificação taxonômica</caption>${taxo.map(([k, v]) => `<tr><th scope="row">${k}</th><td${k === 'Gênero' ? ' class="bin"' : ''}>${es(v)}</td></tr>`).join('')}<tr><th scope="row">Espécie</th><td class="bin">${es(e.nome_cientifico)}</td></tr></table>` : ''}
  </div></section>` : ''}

  <section class="bloco"><header><h2>Compostos e atividades</h2><p>${nRegistros(e.reg.length)} na base. Cada linha é uma molécula descrita em uma fonte.</p></header>
    <div>${e.reg.length ? `<div class="rolar"><table class="tabela">
      <thead><tr><th>Molécula e classe</th><th>Atividade</th><th>Estudo</th><th>Evidência</th><th>Fonte</th></tr></thead>
      <tbody>${e.reg.map(linhaRegistro).join('')}</tbody></table></div>` : '<p class="mudo">Nenhum registro de molécula para esta espécie.</p>'}
    </div></section>

  <section class="bloco"><header><h2>Distribuição em Roraima</h2><p>Registros da base com município e ocorrências georreferenciadas do GBIF dentro dos limites do estado.</p></header>
    <div class="distrib">
      <div><div id="mapa-esp" role="img" aria-label="Mapa de ocorrências de ${es(e.nome_cientifico)} em Roraima"></div>
        <div class="legenda"><span><i style="background:#E7B04F"></i>Ocorrência GBIF</span><span><i style="background:#7FD39A"></i>Registro da base com coordenada</span><span><i style="background:#2E6B3F;border-radius:2px"></i>Município com registro na base</span></div></div>
      <div>
        <h3 style="font-size:1.1rem">Registros da base</h3>
        ${regMun.length ? `<ul class="lista-mun">${[...new Set(regMun.map(r => r.municipio_ibge))].map(c => `<li><span>${es(MUN[c] || c)}</span><b>${nRegistros(regMun.filter(r => r.municipio_ibge === c).length)}</b></li>`).join('')}</ul>`
          : '<p class="estado">Nenhum registro desta espécie tem município informado. Isso não indica ausência em Roraima.</p>'}
        <h3 style="font-size:1.1rem;margin-top:1.6rem">Ocorrências no GBIF</h3>
        <div id="gbif-rr" class="estado">Consultando o GBIF…</div>
      </div>
    </div></section>

  ${m ? blocoMolecula(m) : ''}

  <section class="bloco"><header><h2>Toxicidade e cuidados</h2></header><div>
    ${e.toxicidade ? `<p class="texto-longo">${es(e.toxicidade)}</p>` : '<p class="mudo">Dados de toxicidade e contraindicações ainda não disponíveis na base.</p>'}
    <div class="alerta"><p>${e.tipo === 'animais' ? 'Em caso de acidente, procure atendimento de saúde imediatamente. Não faça torniquete, não corte nem sugue o local da picada.' : 'Conteúdo informativo. Não use plantas ou fungos com fins medicinais sem orientação profissional. O uso tradicional não equivale a eficácia comprovada.'}</p></div>
  </div></section>`;

  if (m && m.pdb_id) $('#carregar-3d')?.addEventListener('click', () => abrir3D(m.pdb_id));
  mapaDaEspecie(e);
}

function linhaRegistro(r){
  const m = MOL[r.molecula_id];
  const ids = [];
  if (m?.pdb_id) ids.push(`<a href="https://www.rcsb.org/structure/${es(m.pdb_id)}" target="_blank" rel="noopener">PDB <span class="cod">${es(m.pdb_id)}</span></a>`);
  if (m?.uniprot_id) ids.push(`<a href="https://www.uniprot.org/uniprotkb/${es(m.uniprot_id)}" target="_blank" rel="noopener">UniProt <span class="cod">${es(m.uniprot_id)}</span></a>`);
  if (m?.pubchem_cid) ids.push(`<a href="https://pubchem.ncbi.nlm.nih.gov/compound/${es(m.pubchem_cid)}" target="_blank" rel="noopener">PubChem <span class="cod">${es(m.pubchem_cid)}</span></a>`);
  return `<tr>
    <td><span class="mol">${es(r.molecula)}</span><small>${es(r.classe || 'classe não informada')}</small>${ids.length ? `<span class="ids">${ids.join('')}</span>` : ''}</td>
    <td>${es(r.atividade)}${r.municipio_ibge ? `<small>${es(MUN[r.municipio_ibge] || r.municipio_ibge)}</small>` : ''}</td>
    <td>${r.tipo_estudo ? es(r.tipo_estudo) : '<span class="mudo">não informado</span>'}<small>${naoTranscrito(r.metodo) ? 'método não transcrito' : es(r.metodo)}</small></td>
    <td>${selo(r.grau)}</td>
    <td>${es(r.referencia || 'sem referência')}${r.ano ? `, ${es(r.ano)}` : ''}${r.doi ? `<small>${linkDOI(r.doi)}</small>` : '<small>sem DOI</small>'}</td>
  </tr>`;
}

function blocoMolecula(m){
  const ef = lista(m.efeitos), fontes = lista(m.fontes).map(f => f.split('|'));
  return `<section class="bloco"><header><h2>Molécula em destaque</h2><p>${es(m.nome)}</p></header>
    <div class="destaque">
      <div class="texto-longo">
        <h3 style="font-size:1.6rem;margin-bottom:.4rem">${es(m.nome)}</h3>
        ${m.tipo ? `<p class="mudo">${es(m.tipo)}</p>` : ''}
        ${m.descricao ? `<p>${es(m.descricao)}</p>` : ''}
        ${m.mecanismo ? `<h3 style="font-size:1.1rem;margin:1.3rem 0 .3rem">Mecanismo de ação</h3><p>${es(m.mecanismo)}</p>` : ''}
        ${ef.length ? `<h3 style="font-size:1.1rem;margin:1.3rem 0 .3rem">Efeitos descritos</h3><ul class="efeitos">${ef.map(x => `<li>${es(x)}</li>`).join('')}</ul>` : ''}
        ${fontes.length ? `<h3 style="font-size:1.1rem;margin:1.3rem 0 .3rem">Fontes</h3><ul class="fontes">${fontes.map(([t, u]) => `<li>${u ? `<a href="${es(u)}" target="_blank" rel="noopener">${es(t)}</a>` : es(t)}</li>`).join('')}</ul>
          ${fontes.some(([t]) => /wiki/i.test(t)) ? '<p class="aviso-dado" style="margin-top:1rem">Parte deste texto se baseia em fontes enciclopédicas. Antes da publicação definitiva, substitua por artigos revisados por pares.</p>' : ''}` : ''}
      </div>
      <div>
        ${m.pdb_id ? `<div id="visor3d">${m.imagem ? `<img src="${es(m.imagem)}" alt="Estrutura de ${es(m.nome)}">` : ''}<div class="visor-msg"><span>Estrutura tridimensional disponível<br>(PDB <span class="cod">${es(m.pdb_id)}</span>, Protein Data Bank)</span><button type="button" id="carregar-3d">Carregar estrutura 3D</button></div></div>
          <div class="visor-barra" hidden id="visor-barra"><button class="botao" type="button" id="b-girar">Pausar rotação</button><button class="botao" type="button" id="b-centro">Centralizar</button></div>
          <p class="mudo" style="font-size:.84rem">Arraste para girar e use a roda ou o gesto de pinça para ampliar. Estrutura carregada do RCSB PDB.</p>`
        : m.imagem ? `<img src="${es(m.imagem)}" alt="Estrutura de ${es(m.nome)}" style="width:100%;border-radius:6px">` : ''}
        ${m.imagem && m.imagem_credito ? `<p class="mudo" style="font-size:.8rem">Imagem: ${es(m.imagem_credito)}</p>` : ''}
      </div>
    </div></section>`;
}

async function abrir3D(pdb){
  const el = $('#visor3d'); if (!el) return;
  el.innerHTML = '<div class="visor-msg"><span>Carregando estrutura 3D…</span></div>';
  try {
    if (!window.$3Dmol){ try { await carregarScript('https://cdnjs.cloudflare.com/ajax/libs/3Dmol/2.0.4/3Dmol-min.js'); } catch (_) { await carregarScript('https://3Dmol.org/build/3Dmol-min.js'); } }
    const r = await fetch(`https://files.rcsb.org/download/${encodeURIComponent(pdb)}.pdb`); if (!r.ok) throw 0;
    const txt = await r.text(); el.innerHTML = '';
    visor = $3Dmol.createViewer(el, {backgroundAlpha:0});
    visor.addModel(txt, 'pdb'); visor.setStyle({}, {cartoon:{colorscheme:'chain'}}); visor.zoomTo(); visor.render();
    girando = !matchMedia('(prefers-reduced-motion: reduce)').matches; if (girando) visor.spin('y', .6);
    const b = $('#visor-barra'); b.hidden = false;
    $('#b-girar').textContent = girando ? 'Pausar rotação' : 'Girar automaticamente';
    $('#b-girar').onclick = () => { girando = !girando; visor.spin(girando ? 'y' : false, .6); $('#b-girar').textContent = girando ? 'Pausar rotação' : 'Girar automaticamente'; };
    $('#b-centro').onclick = () => { visor.zoomTo(); visor.render(); };
  } catch (e) {
    el.innerHTML = '<div class="visor-msg"><span>Não foi possível carregar a estrutura 3D. Verifique a conexão.</span><button type="button" id="carregar-3d">Tentar de novo</button></div>';
    $('#carregar-3d').onclick = () => abrir3D(pdb);
  }
}

/* ---------- GBIF + mapa da espécie ---------- */
// Consulta uma caixa geográfica que envolve Roraima e depois filtra os pontos
// pelos polígonos do IBGE, atribuindo cada ocorrência ao município correto.
const CAIXA_RR = 'decimalLatitude=-1.7,5.4&decimalLongitude=-65,-58.8';
function dentroAnel(x, y, a){ let d = false; for (let i = 0, j = a.length - 1; i < a.length; j = i++){ const [xi, yi] = a[i], [xj, yj] = a[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; }
function dentroPoligono(x, y, p){ if (!dentroAnel(x, y, p[0])) return false; for (let h = 1; h < p.length; h++) if (dentroAnel(x, y, p[h])) return false; return true; }
function municipioDe(lon, lat, g){ for (const f of g.features){ const G = f.geometry; const P = G.type === 'Polygon' ? [G.coordinates] : G.coordinates; if (P.some(p => dentroPoligono(lon, lat, p))) return +f.properties.codarea; } return null; }

async function consultarGBIF(e){
  if (e._gbif) return e._gbif;
  const m = await fetchJSON(`${GBIF}/species/match?name=${encodeURIComponent(e.nome_cientifico)}`);
  if (!m.usageKey || m.matchType === 'NONE') return (e._gbif = {achou:false});
  const k = m.acceptedUsageKey || m.usageKey;
  const url = o => `${GBIF}/occurrence/search?taxonKey=${k}&${CAIXA_RR}&hasCoordinate=true&hasGeospatialIssue=false&limit=300&offset=${o}`;
  const [br, p0] = await Promise.all([fetchJSON(`${GBIF}/occurrence/search?taxonKey=${k}&country=BR&limit=0`), fetchJSON(url(0))]);
  let res = p0.results; const mais = [];
  for (let o = 300; o < Math.min(p0.count, 1500); o += 300) mais.push(fetchJSON(url(o)));
  (await Promise.all(mais)).forEach(p => { res = res.concat(p.results); });
  return (e._gbif = {achou:true, chave:k, br:br.count, caixa:p0.count, lidos:res.length,
    pts:res.map(o => ({lat:o.decimalLatitude, lon:o.decimalLongitude, ano:o.year, base:o.basisOfRecord, inst:o.institutionCode, id:o.key}))});
}

async function mapaDaEspecie(e){
  const box = $('#mapa-esp'), info = $('#gbif-rr'), idAtual = e.id;
  const aindaAqui = () => location.hash === '#especie/' + idAtual;
  if (temLeaflet()){
    mapaEsp = L.map(box, {zoomSnap:.25, scrollWheelZoom:false}).setView([2.1, -61.4], 6.2);
    L.tileLayer(EOX, {attribution:EOX_ATR, maxZoom:13}).addTo(mapaEsp);
  } else box.innerHTML = '<p style="padding:1rem;color:#A6BCB3">Mapa indisponível sem conexão.</p>';
  let g = null;
  try { g = await malha(); } catch (_) {}
  if (!aindaAqui()) return;
  if (g && mapaEsp){
    const lyr = L.geoJSON(g, {style:f => { const tem = e.muns.includes(+f.properties.codarea); return {color:'#E8F5EC', weight:1, opacity:.6, fillColor:tem ? '#2E6B3F' : '#0F3A33', fillOpacity:tem ? .45 : .05}; },
      onEachFeature:(f, l) => l.bindTooltip(es(MUN[+f.properties.codarea] || ''), {className:'dica', sticky:true})}).addTo(mapaEsp);
    mapaEsp.fitBounds(lyr.getBounds(), {padding:[12, 12]});
  }
  if (mapaEsp) e.reg.filter(r => r.lat != null && r.lon != null).forEach(r =>
    L.circleMarker([r.lat, r.lon], {radius:7, color:'#0F3A33', weight:2, fillColor:'#7FD39A', fillOpacity:1}).bindTooltip(`Registro ${es(r.id)}: ${es(r.molecula)}`, {className:'dica'}).addTo(mapaEsp));

  try {
    const d = await consultarGBIF(e);
    if (!aindaAqui()) return;
    if (!d.achou){ info.textContent = 'O nome não foi encontrado no GBIF. Confira a grafia ou a sinonímia.'; $('#n-rr').textContent = '—'; return; }
    $('#lk-gbif').href = `https://www.gbif.org/species/${d.chave}`;
    $('#n-br').textContent = fm(d.br);
    let pts = d.pts, porMun = {};
    if (g){ pts = pts.map(p => ({...p, mun:municipioDe(p.lon, p.lat, g)})).filter(p => p.mun); pts.forEach(p => { porMun[p.mun] = (porMun[p.mun] || 0) + 1; }); }
    $('#n-rr').textContent = g ? fm(pts.length) : '—';
    if (mapaEsp) pts.forEach(p => L.circleMarker([p.lat, p.lon], {radius:4.5, color:'#07161A', weight:1, fillColor:'#E7B04F', fillOpacity:.95})
      .bindTooltip(`${p.mun ? es(MUN[p.mun]) + '<br>' : ''}${p.ano || 'ano não informado'}${p.inst ? ', ' + es(p.inst) : ''}`, {className:'dica'}).addTo(mapaEsp));
    const lin = Object.entries(porMun).sort((a, b) => b[1] - a[1]);
    info.innerHTML = !g ? `<p>${fm(d.caixa)} ocorrências na região de Roraima, mas a malha do IBGE não carregou para separar as que estão dentro do estado.</p>`
      : pts.length ? `<p>${fm(pts.length)} ${pts.length === 1 ? 'ocorrência georreferenciada' : 'ocorrências georreferenciadas'} dentro de Roraima${d.caixa > d.lidos ? ` (entre as ${fm(d.lidos)} primeiras consultadas)` : ''}.</p>
        <ul class="lista-mun">${lin.map(([c, n]) => `<li><span>${es(MUN[c] || c)}</span><b>${fm(n)}</b></li>`).join('')}</ul>
        <p style="font-size:.82rem;margin-top:.8rem">Dados GBIF.org, consulta em tempo real. Mais registros podem refletir maior esforço de coleta, não maior abundância.</p>`
      : '<p>Nenhuma ocorrência georreferenciada do GBIF dentro de Roraima. Isso não indica ausência da espécie.</p>';
  } catch (_) {
    if (!aindaAqui()) return;
    $('#n-rr').textContent = '—';
    info.textContent = 'Não foi possível consultar o GBIF agora. Os dados da base continuam válidos; tente recarregar a página com conexão.';
  }
}

/* =====================================================================
   USOS
   ===================================================================== */
function mostrarUsos(sel){
  const ativ = {}; R.forEach(r => { const k = slug(r.atividade); (ativ[k] = ativ[k] || {nome:r.atividade, regs:[]}).regs.push(r); });
  const ord = Object.entries(ativ).sort((a, b) => b[1].regs.length - a[1].regs.length || a[1].nome.localeCompare(b[1].nome));
  $('#chips-usos').innerHTML = ord.map(([k, a]) => `<a href="#usos/${k}"${k === sel ? ' aria-current="true"' : ''}>${es(a.nome)}<span>${a.regs.length}</span></a>`).join('');
  const a = ativ[sel];
  $('#res-usos').innerHTML = !a ? '' : `<h2 style="margin-bottom:.6rem">${es(a.nome.charAt(0).toUpperCase() + a.nome.slice(1))}</h2>
    <ol class="indice">${[...new Set(a.regs.map(r => r.esp))].map(e => linhaIndice(e, a.regs.filter(r => r.esp === e).map(r => `<span>${es(r.molecula)}</span>`).join(''))).join('')}</ol>`;
}

/* =====================================================================
   CONEXÃO: conjuntos paralelos espécie → molécula → classe → atividade
   ===================================================================== */
let filtroCx = 'todos';
function desenharConexao(){
  const opcoes = [['todos', 'Tudo'], ['animais', 'Animais peçonhentos'], ['plantas', 'Plantas medicinais'], ['fungos', 'Fungos']].filter(([k]) => k === 'todos' || E.some(e => e.tipo === k));
  $('#cx-ctrl').innerHTML = opcoes.map(([k, t]) => `<button type="button" data-cx="${k}" aria-pressed="${k === filtroCx}">${t}</button>`).join('') + '<span class="dica-txt">Toque duas vezes em uma espécie para abrir a ficha.</span>';
  const regs = R.filter(r => filtroCx === 'todos' || r.esp.tipo === filtroCx);
  const svg = $('#cx');
  if (!regs.length){ svg.innerHTML = ''; svg.setAttribute('viewBox', '0 0 1000 60'); $('#cx-detalhe').textContent = 'Nenhum registro neste grupo.'; return; }
  const COLS = [['esp', 'Espécie', r => r.esp.nome_cientifico], ['mol', 'Molécula', r => r.molecula], ['cla', 'Classe', r => r.classe || 'classe não informada'], ['atv', 'Atividade', r => r.atividade]];
  const PASSO = 30, TOPO = 46, X = [24, 280, 536, 792];
  // nós por coluna
  const nos = COLS.map(([k], ci) => { const mapa_ = new Map(); regs.forEach(r => { const v = COLS[ci][2](r); if (!mapa_.has(v)) mapa_.set(v, {k, ci, v, regs:[]}); mapa_.get(v).regs.push(r); }); return [...mapa_.values()]; });
  nos[0].sort((a, b) => a.v.localeCompare(b.v));
  // ordena as colunas seguintes pelo baricentro da anterior para reduzir cruzamentos
  for (let ci = 1; ci < 4; ci++){
    const pos = new Map(nos[ci - 1].map((n, i) => [n.v, i]));
    nos[ci].forEach(n => { n.b = n.regs.reduce((s, r) => s + pos.get(COLS[ci - 1][2](r)), 0) / n.regs.length; });
    nos[ci].sort((a, b) => a.b - b.b || a.v.localeCompare(b.v));
  }
  const maxN = Math.max(...nos.map(c => c.length)), H = TOPO + maxN * PASSO + 16;
  nos.forEach((col, ci) => { const off = (maxN - col.length) * PASSO / 2; col.forEach((n, i) => { n.x = X[ci]; n.y = TOPO + off + i * PASSO + PASSO / 2; }); });
  const idx = nos.map(col => new Map(col.map(n => [n.v, n])));
  const corta = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;
  // As linhas saem do fim de cada rótulo (medido depois de desenhar) até o ponto seguinte.
  const caminhos = () => { let lig = '';
    regs.forEach((r, ri) => { for (let ci = 0; ci < 3; ci++){
      const a = idx[ci].get(COLS[ci][2](r)), b = idx[ci + 1].get(COLS[ci + 1][2](r));
      const x0 = a.x + (a.w || 0), x1 = b.x - 6, mx = (x0 + x1) / 2;
      lig += `<path class="lig" data-r="${ri}" d="M${x0},${a.y} C${mx},${a.y} ${mx},${b.y} ${x1},${b.y}"/>`; } });
    return lig; };
  let txt = COLS.map(([, t], ci) => `<text class="cab" x="${X[ci] - 6}" y="22">${t}</text>`).join('');
  nos.forEach(col => col.forEach(n => {
    const rs = n.regs.map(r => regs.indexOf(r)).join(' ');
    txt += `<g class="no ${n.k}" tabindex="0" role="button" data-rs="${rs}" data-v="${es(n.v)}" data-ci="${n.ci}"${n.k === 'esp' ? ` data-id="${es(n.regs[0].esp.id)}"` : ''} transform="translate(${n.x},${n.y})">
      <title>${es(n.v)}</title><circle r="5"/><text x="11" y="4.5">${es(corta(n.v, n.k === 'esp' ? 30 : 31))}</text></g>`;
  }));
  svg.setAttribute('viewBox', `0 0 1040 ${H}`);
  svg.innerHTML = '<g id="cx-lig"></g>' + txt;
  $$('#cx .no').forEach(g => { const n = idx[+g.dataset.ci].get(g.dataset.v); try { n.w = 11 + g.querySelector('text').getComputedTextLength() + 6; } catch (_) { n.w = 8; } });
  $('#cx-lig').innerHTML = caminhos();
  $('#cx-detalhe').textContent = `${nRegistros(regs.length)}, ${nEspecies(nos[0].length)}, ${nos[1].length} moléculas, ${nos[2].length} classes e ${nos[3].length} atividades.`;
  svg._regs = regs;
}
function focarNo(g){
  const svg = $('#cx'), regs = svg._regs; if (!g){ svg.classList.remove('foco'); $$('#cx .on').forEach(x => x.classList.remove('on')); return; }
  const set = new Set(g.dataset.rs.split(' ').map(Number));
  svg.classList.add('foco');
  $$('#cx .lig').forEach(p => p.classList.toggle('on', set.has(+p.dataset.r)));
  const vals = new Set(); set.forEach(i => { const r = regs[i]; vals.add('0|' + r.esp.nome_cientifico); vals.add('1|' + r.molecula); vals.add('2|' + (r.classe || 'classe não informada')); vals.add('3|' + r.atividade); });
  $$('#cx .no').forEach(n => n.classList.toggle('on', vals.has(n.dataset.ci + '|' + n.dataset.v)));
  const esp = [...new Set([...set].map(i => regs[i].esp.nome_cientifico))];
  $('#cx-detalhe').innerHTML = `<b style="color:var(--tinta)">${es(g.dataset.v)}</b>: ${nRegistros(set.size)} ${esp.length > 1 || +g.dataset.ci !== 0 ? `em ${esp.map(n => `<span class="bin">${es(n)}</span>`).join(', ')}` : ''}${+g.dataset.ci === 0 ? ` <a href="#especie/${es(g.dataset.id)}">Abrir ficha</a>` : ''}`;
}

/* =====================================================================
   BUSCA
   ===================================================================== */
function realce(t, q){ if (!q) return es(t); const s = sem(t), i = s.indexOf(q); return i < 0 ? es(t) : es(t.slice(0, i)) + '<mark>' + es(t.slice(i, i + q.length)) + '</mark>' + es(t.slice(i + q.length)); }
function buscar(termo){
  const q = sem(termo).trim(), out = $('#res-busca');
  if (q.length < 2){ out.innerHTML = q ? '<p class="mudo" style="margin-top:1.5rem">Digite pelo menos duas letras.</p>' : ''; return; }
  const esp = E.filter(e => sem([e.nome_cientifico, e.nome_popular, e.outros_nomes, e.familia].join(' ')).includes(q));
  const mol = {}, atv = {};
  R.forEach(r => {
    if (sem(r.molecula + ' ' + r.classe).includes(q)) (mol[r.molecula] = mol[r.molecula] || []).push(r);
    if (sem(r.atividade).includes(q)) (atv[r.atividade] = atv[r.atividade] || []).push(r);
  });
  const grupo = (t, itens) => itens.length ? `<div class="grupo-res"><h2>${t}</h2><ul class="res">${itens.join('')}</ul></div>` : '';
  const html = grupo('Espécies', esp.map(e => `<li><a href="#especie/${es(e.id)}"><span class="t bin" style="font-size:1.15rem">${realce(e.nome_cientifico, q)}</span><small>${realce(e.nome_popular || GRUPOS[e.tipo].sing, q)}${e.familia ? ', ' + es(e.familia) : ''}</small></a></li>`))
    + grupo('Moléculas', Object.entries(mol).map(([n, rs]) => `<li><a href="#especie/${es(rs[0].esp.id)}"><span class="t">${realce(n, q)}</span><small>${realce(rs[0].classe || '', q)}${rs[0].classe ? '. ' : ''}Descrita em ${[...new Set(rs.map(r => r.esp.nome_cientifico))].map(es).join(', ')}</small></a></li>`))
    + grupo('Atividades', Object.entries(atv).map(([n, rs]) => `<li><a href="#usos/${slug(n)}"><span class="t">${realce(n, q)}</span><small>${nRegistros(rs.length)} em ${nEspecies(new Set(rs.map(r => r.esp)).size)}</small></a></li>`));
  out.innerHTML = html || `<p style="margin-top:1.5rem">Nada encontrado para “${es(termo)}”. Confira a grafia ou tente o nome científico.</p>`;
}

/* =====================================================================
   CONTRIBUIR: guia, dicionário de dados e qualidade da base
   ===================================================================== */
const DIC = {
  'especies.csv':[
    ['id', 0, 'Identificador da espécie, sem acentos e com hífens. Se ficar vazio, é gerado do nome científico.', 'crotalus-durissus'],
    ['nome_cientifico', 1, 'Nome aceito, validado no Reflora (plantas e fungos) ou no Reptile Database (répteis).', 'Crotalus durissus'],
    ['autoria', 0, 'Autor e ano da descrição.', 'Linnaeus, 1758'],
    ['nome_popular', 0, 'Nome popular principal em Roraima.', 'cascavel'],
    ['outros_nomes', 0, 'Outros nomes populares, separados por ponto e vírgula.', 'boicininga; maracá'],
    ['grupo', 1, 'animal peçonhento, planta medicinal ou fungo.', 'animal peçonhento'],
    ['reino … genero', 0, 'Classificação: reino, filo, classe, ordem, familia, genero.', 'Viperidae'],
    ['descricao', 0, 'Texto curto de identificação, escrito pela equipe.', ''],
    ['subespecies', 0, 'Separadas por ponto e vírgula.', 'C. d. ruruima'],
    ['foto', 0, 'Caminho da imagem na pasta imagens.', 'imagens/crotalus-durissus.jpg'],
    ['foto_credito', 0, 'Autor da foto. Obrigatório quando houver foto.', 'Nome do fotógrafo'],
    ['foto_licenca', 0, 'Licença de uso da foto.', 'CC BY 4.0'],
    ['molecula_destaque', 0, 'id de uma linha de moleculas.csv para mostrar em destaque.', 'crotoxina'],
    ['ocorrencias_gbif_brasil', 0, 'Contagem de referência. A ficha consulta o valor atual no GBIF.', '2385'],
    ['status_conservacao', 0, 'Categoria IUCN ou da lista nacional.', 'LC'],
    ['toxicidade', 0, 'Toxicidade e contraindicações conhecidas, com fonte.', '']
  ],
  'moleculas.csv':[
    ['id', 1, 'Identificador da molécula.', 'crotoxina'],
    ['nome', 1, 'Nome da molécula.', 'Crotoxina'],
    ['tipo', 0, 'Tipo ou composição.', 'Neurotoxina heterodimérica'],
    ['descricao, mecanismo', 0, 'O que é e como age.', ''],
    ['efeitos', 0, 'Efeitos descritos, separados por ponto e vírgula.', ''],
    ['pdb_id', 0, 'Código no Protein Data Bank. Ativa o visualizador 3D.', '3R0L'],
    ['uniprot_id', 0, 'Código UniProt, para proteínas e toxinas.', ''],
    ['pubchem_cid', 0, 'Código PubChem, para compostos de plantas e fungos.', '370 (ácido gálico)'],
    ['imagem, imagem_credito', 0, 'Imagem da estrutura e seu crédito.', 'imagens/crotoxina.jpg'],
    ['fontes', 0, 'Título|link, separados por ponto e vírgula.', 'RCSB PDB|https://www.rcsb.org/structure/3R0L']
  ],
  'registros.csv':[
    ['id', 1, 'Identificador do registro.', 'R013'],
    ['especie_id', 1, 'id da espécie em especies.csv.', 'crotalus-durissus'],
    ['molecula', 1, 'Nome da molécula como aparece na fonte.', 'Convulxina'],
    ['molecula_id', 0, 'id em moleculas.csv, quando existir.', 'crotoxina'],
    ['classe', 1, 'Classe química ou bioquímica.', 'lectina tipo C'],
    ['atividade', 1, 'Atividade biológica observada. Use sempre a mesma grafia para a mesma atividade.', 'atividade antimiotóxica'],
    ['tipo_estudo', 1, 'in vitro, in vivo, in silico, clínico ou etnobotânico.', 'in vitro'],
    ['metodo', 0, 'Método resumido.', 'ensaio de inibição enzimática'],
    ['grau', 1, 'A, B ou C (ver critérios abaixo).', 'B'],
    ['referencia', 1, 'Citação curta: autores, periódico.', 'Silva et al., Toxicon'],
    ['doi', 1, 'DOI do trabalho. Sem DOI, informe o link em referencia.', '10.1016/j.toxicon.2020.01.001'],
    ['ano', 1, 'Ano de publicação.', '2022'],
    ['municipio_ibge', 0, 'Código IBGE do município de Roraima, se o material veio de lá.', '1400100'],
    ['latitude, longitude', 0, 'Coordenadas decimais do material, se houver.', '2.82 / -60.67'],
    ['voucher', 0, 'Número de tombo em coleção ou herbário.', 'INPA-H 123456'],
    ['responsavel, data_registro', 0, 'Quem inseriu e quando (AAAA-MM-DD).', '2026-11-12']
  ]
};

function pendencias(){
  const p = [];
  E.forEach(e => {
    const itens = [];
    if (e._incompleta) itens.push('Espécie aparece em registros.csv mas não em especies.csv');
    if (!e.autoria) itens.push('Sem autoria taxonômica');
    if (!e.foto) itens.push('Sem fotografia');
    else if (!e.foto_credito || /confirmar/i.test(e.foto_credito)) itens.push('Foto sem crédito confirmado');
    if (!e.descricao) itens.push('Sem descrição');
    e.reg.forEach(r => {
      const f = [];
      if (!r.doi) f.push('sem DOI');
      if (r.grau === '0') f.push('grau não classificado');
      if (!r.tipo_estudo) f.push('tipo de estudo vazio');
      if (naoTranscrito(r.metodo)) f.push('método não transcrito');
      if (/fict[ií]cio|demonstra/i.test(r.referencia)) f.push('registro de demonstração');
      if (f.length) itens.push(`${r.id} (${r.molecula}): ${f.join(', ')}`);
    });
    if (itens.length) p.push({e, itens});
  });
  return p;
}

function mostrarContribuir(){
  const p = pendencias(), cont = (fn) => R.filter(fn).length;
  const origem = Object.values(ORIGEM).every(o => o === 'arquivo') ? 'Os dados vêm das tabelas configuradas em <span class="cod">app.js</span>.'
    : 'Os dados exibidos vêm da cópia embutida no <span class="cod">index.html</span>, porque as tabelas configuradas não puderam ser lidas. Isso é normal ao abrir o arquivo direto do computador. No GitHub Pages, os arquivos da pasta <span class="cod">dados</span> são lidos automaticamente.';
  $('#contribuir').innerHTML = `
  <div class="cab-visao"><h1>Contribuir com a base</h1><p class="leve">Guia para a equipe científica: como inserir dados, o que cada campo significa e o que ainda falta revisar.</p></div>

  <section class="bloco"><header><h2>Como alimentar</h2></header><div>
    <ol class="passos">
      <li><b>Use a planilha modelo.</b> A base tem três tabelas: espécies, moléculas e registros. Um registro liga uma espécie a uma molécula e a uma atividade, com a fonte. <span style="display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.6rem"><a class="botao" href="dados/especies.csv" download>especies.csv</a><a class="botao" href="dados/moleculas.csv" download>moleculas.csv</a><a class="botao" href="dados/registros.csv" download>registros.csv</a></span></li>
      <li><b>Uma linha por evidência.</b> Se a mesma espécie tem três moléculas descritas, são três linhas em registros, cada uma com sua referência e DOI.</li>
      <li><b>Valide o nome científico</b> antes de inserir: Flora e Funga do Brasil (Reflora) para plantas e fungos, Reptile Database para serpentes.</li>
      <li><b>Atribua o grau de evidência</b> A, B ou C a cada registro, conforme os critérios abaixo.</li>
      <li><b>Publique.</b> Substitua os arquivos da pasta <span class="cod">dados</span> no GitHub, ou publique a planilha Google como CSV e cole os links no início do <span class="cod">app.js</span>. O site se atualiza sozinho.</li>
    </ol>
    <p class="origem">${origem}</p>
  </div></section>

  <section class="bloco"><header><h2>Graus de evidência</h2></header><div>
    <table class="taxo" style="margin:0">${['A', 'B', 'C'].map(g => `<tr><th scope="row" style="padding-right:1rem"><span class="grau grau-${g}"><b>${g}</b></span></th><td>${GRAUS[g].txt.charAt(0).toUpperCase() + GRAUS[g].txt.slice(1)}.</td></tr>`).join('')}</table>
    <p class="mudo" style="margin-top:1rem;font-size:.92rem">Registros sem grau aparecem como “Não classificado”.</p>
  </div></section>

  <section class="bloco"><header><h2>Qualidade da base</h2><p>Calculado automaticamente a partir dos dados carregados.</p></header><div>
    <div class="qual">
      <div><b>${R.length}</b><span>registros</span></div>
      <div><b>${cont(r => r.doi)}</b><span>com DOI</span></div>
      <div><b>${cont(r => r.grau !== '0')}</b><span>com grau atribuído</span></div>
      <div><b>${cont(r => r.municipio_ibge)}</b><span>com município</span></div>
      <div><b>${E.filter(e => e.foto).length}</b><span>espécies com foto</span></div>
    </div>
    ${p.length ? `<h3 style="font-size:1.15rem;margin-bottom:.4rem">Pendências por espécie</h3><ul class="pend">${p.map(({e, itens}) => `<li><a href="#especie/${es(e.id)}" class="bin" style="font-size:1.1rem">${es(e.nome_cientifico)}</a><ul>${itens.map(i => `<li>${es(i)}</li>`).join('')}</ul></li>`).join('')}</ul>` : '<p>Nenhuma pendência encontrada.</p>'}
    <div style="margin-top:1.2rem"><button class="botao" type="button" data-baixar="todos">Baixar todos os registros (CSV)</button></div>
  </div></section>

  <section class="bloco"><header><h2>Dicionário de dados</h2><p><span class="obrig">*</span> obrigatório</p></header><div class="dic">
    ${Object.entries(DIC).map(([arq, cols]) => `<h3>${arq}</h3><div class="rolar"><table class="tabela"><thead><tr><th>Coluna</th><th>Descrição</th><th>Exemplo</th></tr></thead><tbody>
      ${cols.map(([c, o, d, x]) => `<tr><td>${es(c)}${o ? ' <span class="obrig">*</span>' : ''}</td><td>${es(d)}</td><td class="mudo">${es(x)}</td></tr>`).join('')}</tbody></table></div>`).join('')}
  </div></section>

  <section class="bloco"><header><h2>Antes de publicar</h2></header><div class="texto-longo">
    <p>Dados de plantas e fungos ligados a uso tradicional podem envolver conhecimento tradicional associado ao patrimônio genético. Confirme com a instituição a necessidade de cadastro no SisGen (Lei 13.123/2015) antes de tornar esses registros públicos.</p>
    <p>Toda fotografia precisa de crédito e licença registrados em <span class="cod">especies.csv</span>.</p>
  </div></section>`;
}

/* ---------- autoria e citação ---------- */
const MESES = ['jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const hojeABNT = () => { const d = new Date(); return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`; };
const urlBase = () => location.href.split('#')[0];
function citacao(e){
  const ano = new Date().getFullYear();
  return e ? `BIO DADOS AMAZÔNIA. <i>${es(e.nome_cientifico)}</i>${e.autoria ? ' ' + es(e.autoria) : ''}. In: BIO DADOS AMAZÔNIA: banco digital de Roraima. Roraima, ${ano}. Disponível em: ${es(urlBase())}#especie/${es(e.id)}. Acesso em: ${hojeABNT()}.`
    : `BIO DADOS AMAZÔNIA: banco digital de Roraima. Roraima, ${ano}. Disponível em: ${es(urlBase())}. Acesso em: ${hojeABNT()}.`;
}
function mostrarAutoria(){
  $('#autoria').innerHTML = `
  <div class="cab-visao"><h1>Autoria</h1><p class="leve">Equipe, instituição, forma de citação e fontes de dados.</p></div>
  <section class="bloco"><header><h2>Equipe</h2></header><div><p class="aviso-dado">A preencher: coordenação, pesquisadores, bolsistas e colaboradores, com vínculo institucional e ORCID.</p></div></section>
  <section class="bloco"><header><h2>Instituição</h2></header><div><p class="aviso-dado">A preencher: instituição responsável, programa ou laboratório e financiamento.</p></div></section>
  <section class="bloco"><header><h2>Como citar a base</h2></header><div><div class="cita">${citacao(null)}</div>
    <p class="mudo" style="font-size:.9rem">Cada ficha de espécie tem sua própria citação. Quando o conjunto de dados tiver DOI, ele entra aqui.</p></div></section>
  <section class="bloco"><header><h2>Licença</h2></header><div><p class="aviso-dado">A definir: licença dos dados e dos textos (por exemplo, CC BY 4.0) e das imagens, que podem ter licenças próprias.</p></div></section>
  <section class="bloco"><header><h2>Fontes de dados</h2></header><div class="texto-longo">
    <p>Limites municipais: IBGE, API de Malhas v3. Área e população: IBGE, Censo 2022 (SIDRA, tabela 4714). Ocorrências: GBIF.org, consultadas em tempo real em cada ficha. Estruturas 3D: RCSB Protein Data Bank. Imagem de satélite: Sentinel-2 cloudless © EOX, com dados Copernicus Sentinel 2020, CC BY-NC-SA 4.0, de uso não comercial.</p>
    <p>Moléculas, classes e atividades: base própria do projeto, com a referência de cada registro.</p>
  </div></section>`;
}
function abrirCitacao(id){
  const e = ESP[id]; $('#cita-txt').innerHTML = citacao(e);
  const d = $('#dlg-cita'); d.showModal ? d.showModal() : d.setAttribute('open', '');
}

/* ---------- exportação ---------- */
const COL_EXP = ['id', 'especie_id', 'nome_cientifico', 'nome_popular', 'grupo', 'molecula', 'classe', 'atividade', 'tipo_estudo', 'metodo', 'grau', 'referencia', 'doi', 'ano', 'municipio_ibge', 'municipio', 'latitude', 'longitude', 'voucher'];
function exportar(alvo){
  let regs = R, nome = 'biodados-registros';
  if (alvo.startsWith('esp:')){ const id = alvo.slice(4); regs = R.filter(r => r.especie_id === id); nome = 'biodados-' + id; }
  else if (GRUPOS[alvo]){ regs = R.filter(r => r.esp.tipo === alvo); nome = 'biodados-' + alvo; }
  const linhas = regs.map(r => ({...r, nome_cientifico:r.esp.nome_cientifico, nome_popular:r.esp.nome_popular, grupo:r.esp.grupo, grau:r.grau === '0' ? '' : r.grau, municipio:MUN[r.municipio_ibge] || ''}));
  baixar(`${nome}.csv`, paraCSV(linhas, COL_EXP));
  toast(`${nRegistros(regs.length)} exportado${regs.length === 1 ? '' : 's'}`);
}

/* =====================================================================
   EVENTOS E INÍCIO
   ===================================================================== */
function ligarEventos(){
  addEventListener('hashchange', rota);
  $('#abrir-menu').onclick = () => { const m = $('#menu'), ab = m.classList.toggle('aberto'); $('#abrir-menu').setAttribute('aria-expanded', String(ab)); };
  document.addEventListener('click', ev => {
    const t = ev.target.closest('[data-citar],[data-baixar],[data-cx],[data-acao]');
    if (!t) return;
    if (t.dataset.citar) abrirCitacao(t.dataset.citar);
    else if (t.dataset.baixar) exportar(t.dataset.baixar);
    else if (t.dataset.cx){ filtroCx = t.dataset.cx; desenharConexao(); }
    else if (t.dataset.acao === 'roraima') escolherMun(null);
  });
  $$('form[data-busca]').forEach(f => f.addEventListener('submit', ev => { ev.preventDefault(); const q = f.q.value.trim(); location.hash = '#busca/' + encodeURIComponent(q); }));
  $('#q-busca').addEventListener('input', ev => { const q = ev.target.value; history.replaceState(null, '', '#busca/' + encodeURIComponent(q)); buscar(q); });
  // conexão: passar o cursor, focar com teclado, tocar
  const cx = $('#cx');
  cx.addEventListener('mouseover', ev => { const g = ev.target.closest('.no'); if (g) focarNo(g); });
  cx.addEventListener('mouseleave', () => focarNo(null));
  cx.addEventListener('focusin', ev => { const g = ev.target.closest('.no'); if (g) focarNo(g); });
  cx.addEventListener('click', ev => { const g = ev.target.closest('.no'); if (g) focarNo(g); else focarNo(null); });
  cx.addEventListener('dblclick', ev => { const g = ev.target.closest('.no.esp'); if (g) location.hash = '#especie/' + g.dataset.id; });
  cx.addEventListener('keydown', ev => { const g = ev.target.closest('.no.esp'); if (g && ev.key === 'Enter') location.hash = '#especie/' + g.dataset.id; });
  $('#cita-fechar').onclick = () => $('#dlg-cita').close();
  $('#cita-copiar').onclick = async () => { const t = $('#cita-txt').textContent; try { await navigator.clipboard.writeText(t); toast('Citação copiada'); } catch (_) { toast('Selecione o texto e copie'); } };
  $('#dlg-cita').addEventListener('click', ev => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
}

(async function iniciar(){
  ligarEventos();
  const [esp, mol, reg] = await Promise.all([carregar('especies'), carregar('moleculas'), carregar('registros')]);
  montar(esp, mol, reg);
  mostrarSecoes();
  $('#municipios').innerHTML = Object.entries(MUN).sort((a, b) => a[1].localeCompare(b[1])).map(([c, n]) => `<button type="button" data-c="${c}" aria-pressed="false" onclick="escolherMun(${c})">${n}</button>`).join('');
  const emb = Object.values(ORIGEM).some(o => o === 'embutido');
  $('#rodape-origem').textContent = `${nEspecies(E.length)} e ${nRegistros(R.length)} na base${emb ? ' (cópia embutida)' : ''}.`;
  rota();
})();
