/**
 * MUNIIZ RIFAS BOT - v17.0
 *
 * ✅ FIX v17.0: Emojis faltando NO REGISTRO CORRIGIDO DEFINITIVAMENTE
 *    → lookupEmoji() normaliza \uFE0F (variation selector) que WhatsApp adiciona
 *    → 🐈 (gato), 🦮 e todos os outros agora detectados corretamente
 *    → Regex de captura reescrita para cobrir todos os tipos Unicode
 *
 * ✅ NOVO v17.0: !remover — remove bichos específicos do pedido
 *    → Admin responde msg do cliente: !remover 1 elefante 2 aguia
 *    → Remove só os bichos informados, devolve cotas ao estoque
 *    → NÃO cancela o pedido inteiro
 *    → Notifica cliente no privado automaticamente
 *    → Solução definitiva quando cancelar não funciona
 *
 * ✅ NOVO v17.0: !ban — bane participante do grupo
 *    → Responde mensagem do spammer + !ban
 *    → Ou: !ban 71999999999
 *    → Bot precisa ser admin do grupo
 *
 * ✅ NOVO v17.0: !limparchat — limpa chat do grupo
 *    → Deleta mensagens recentes do bot
 *    → Envia separador visual chamativo
 *    → Atualiza lista de disponíveis automaticamente
 *
 * ✅ Mantidos todos os fixes da v16.0
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const winston = require('winston');

// ========== CONFIGURAÇÕES GLOBAIS ==========
const PORT = process.env.PORT || 8080;
const DATA_DIR = '/app/data';
const AUTH_DIR = path.join(DATA_DIR, 'auth');
const LOGS_DIR = path.join(DATA_DIR, 'logs');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

const DATA_FILE = path.join(DATA_DIR, 'rifa.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const BANCA_FILE = path.join(DATA_DIR, 'banca.json');
const GRUPO_FILE = path.join(DATA_DIR, 'grupo.json');
const RESULTADOS_FILE = path.join(DATA_DIR, 'resultados.json');

const HORARIOS_BAHIA = ['10:20', '12:20', '15:20', '19:20', '21:20'];

// ========== LOGGER ==========
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'muniiz-rifas' },
    transports: [
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'error.log'),
            level: 'error'
        }),
        new winston.transports.File({
            filename: path.join(LOGS_DIR, 'combined.log')
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// ========== BICHOS ==========
const BICHOS = {
    'G01': { nome: 'Avestruz',   emoji: '🦩', dezenas: ['01','02','03','04'] },
    'G02': { nome: 'Águia',      emoji: '🦅', dezenas: ['05','06','07','08'] },
    'G03': { nome: 'Burro',      emoji: '🫏', dezenas: ['09','10','11','12'] },
    'G04': { nome: 'Borboleta',  emoji: '🦋', dezenas: ['13','14','15','16'] },
    'G05': { nome: 'Cachorro',   emoji: '🐶', dezenas: ['17','18','19','20'] },
    'G06': { nome: 'Cabra',      emoji: '🐐', dezenas: ['21','22','23','24'] },
    'G07': { nome: 'Carneiro',   emoji: '🐏', dezenas: ['25','26','27','28'] },
    'G08': { nome: 'Camelo',     emoji: '🐫', dezenas: ['29','30','31','32'] },
    'G09': { nome: 'Cobra',      emoji: '🐍', dezenas: ['33','34','35','36'] },
    'G10': { nome: 'Coelho',     emoji: '🐇', dezenas: ['37','38','39','40'] },
    'G11': { nome: 'Cavalo',     emoji: '🐎', dezenas: ['41','42','43','44'] },
    'G12': { nome: 'Elefante',   emoji: '🐘', dezenas: ['45','46','47','48'] },
    'G13': { nome: 'Galo',       emoji: '🐔', dezenas: ['49','50','51','52'] },
    'G14': { nome: 'Gato',       emoji: '🐈', dezenas: ['53','54','55','56'] },
    'G15': { nome: 'Jacaré',     emoji: '🐊', dezenas: ['57','58','59','60'] },
    'G16': { nome: 'Leão',       emoji: '🦁', dezenas: ['61','62','63','64'] },
    'G17': { nome: 'Macaco',     emoji: '🦍', dezenas: ['65','66','67','68'] },
    'G18': { nome: 'Porco',      emoji: '🐖', dezenas: ['69','70','71','72'] },
    'G19': { nome: 'Pavão',      emoji: '🦚', dezenas: ['73','74','75','76'] },
    'G20': { nome: 'Peru',       emoji: '🦃', dezenas: ['77','78','79','80'] },
    'G21': { nome: 'Touro',      emoji: '🐃', dezenas: ['81','82','83','84'] },
    'G22': { nome: 'Tigre',      emoji: '🐯', dezenas: ['85','86','87','88'] },
    'G23': { nome: 'Urso',       emoji: '🐻', dezenas: ['89','90','91','92'] },
    'G24': { nome: 'Veado',      emoji: '🦌', dezenas: ['93','94','95','96'] },
    'G25': { nome: 'Vaca',       emoji: '🐮', dezenas: ['97','98','99','00'] }
};

const DEZENA_PARA_BICHO = {};
Object.keys(BICHOS).forEach(codigo => {
    BICHOS[codigo].dezenas.forEach(dezena => {
        DEZENA_PARA_BICHO[dezena] = codigo;
    });
});

const NOME_PARA_CODIGO = {};
Object.keys(BICHOS).forEach(codigo => {
    const bicho = BICHOS[codigo];
    const nome = bicho.nome.toLowerCase();
    const nomeSemAcento = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    NOME_PARA_CODIGO[nome] = codigo;
    NOME_PARA_CODIGO[nomeSemAcento] = codigo;
    NOME_PARA_CODIGO[codigo.toLowerCase()] = codigo;

    if (nome === 'leão') {
        NOME_PARA_CODIGO['leao']  = codigo;
        NOME_PARA_CODIGO['leoes'] = codigo;
        NOME_PARA_CODIGO['leões'] = codigo;
    }
    if (nome === 'jacaré') {
        NOME_PARA_CODIGO['jacare']  = codigo;
        NOME_PARA_CODIGO['jacares'] = codigo;
        NOME_PARA_CODIGO['jacarés'] = codigo;
    }
    if (nome === 'águia') {
        NOME_PARA_CODIGO['aguia']  = codigo;
        NOME_PARA_CODIGO['aguias'] = codigo;
    }
    NOME_PARA_CODIGO[nome + 's'] = codigo;
    NOME_PARA_CODIGO[nomeSemAcento + 's'] = codigo;
});

// ========== MAPA DE EMOJIS PARA BICHO ==========
// Novo: permite reconhecer apostas por emoji (🐷7, 🦋10, 🐘🐘🐘🐘🐘)
const EMOJI_PARA_CODIGO = {};
Object.keys(BICHOS).forEach(codigo => {
    EMOJI_PARA_CODIGO[BICHOS[codigo].emoji] = codigo;
});
// Emojis alternativos comuns que usuários enviam
const EMOJIS_EXTRAS = {
    '🐷': 'G18', // porco (alternativo ao 🐖)
    '🐗': 'G18', // javali → porco
    '🐴': 'G03', // cavalo de face → burro (clientes associam ao burro)
    '🦄': 'G11', // unicórnio → cavalo
    '🐑': 'G07', // ovelha/carneiro alternativo
    '🐏': 'G07', // carneiro alternativo
    '🐂': 'G21', // boi → touro
    '🐄': 'G25', // vaca alternativa
    '🐅': 'G22', // tigre alternativo
    '🐆': 'G22', // leopardo → tigre
    '🦊': 'G05', // raposa → cachorro
    '🐕': 'G05', // cachorro alternativo
    '🐩': 'G05', // poodle → cachorro
    '🦮': 'G05', // cão-guia → cachorro
    '🐈‍⬛': 'G14', // gato preto → gato
    '🦎': 'G15', // lagarto → jacaré
    '🦏': 'G12', // rinoceronte → elefante
    '🦛': 'G12', // hipopótamo → elefante
    '🐪': 'G08', // camelo 1 corcova
    '🐫': 'G08', // camelo 2 corcovas
    '🐇': 'G10', // coelho alternativo
    '🐰': 'G10', // rosto de coelho
    '🐍': 'G09', // cobra alternativa
    '🐸': 'G15', // sapo → jacaré (mais próximo)
    '🦅': 'G02', // águia alternativa
    '🦆': 'G02', // pato → águia (ave)
    '🦉': 'G02', // coruja → águia (ave)
    '🐦': 'G13', // pássaro → galo
    '🐓': 'G13', // galo alternativo
    '🦃': 'G20', // peru alternativo
    '🦚': 'G19', // pavão alternativo
    '🦌': 'G24', // veado alternativo
    '🦋': 'G04', // borboleta alternativa
    '🐛': 'G04', // lagarta → borboleta
    '🦍': 'G17', // gorila → macaco
    '🐒': 'G17', // macaco alternativo
    '🦧': 'G17', // orangotango → macaco
    '🐘': 'G12', // elefante alternativo
    '🦒': 'G24', // girafa → veado (mais parecido)
    '🦓': 'G11', // zebra → cavalo
    '🐺': 'G05', // lobo → cachorro
    '🦊': 'G05', // raposa → cachorro
    '🐻‍❄️': 'G23', // urso polar → urso
    '🐼': 'G23', // panda → urso
};
// Mescla os extras no mapa principal
Object.assign(EMOJI_PARA_CODIGO, EMOJIS_EXTRAS);

/**
 * NOVO v14.0 - extrairApostasDeEmojis
 *
 * Analisa uma string que pode conter:
 * 1. Emojis repetidos como quantidade: 🐷🐷🐷🐷🐷🐷🐷 → porco 7x
 * 2. Emoji + número: 🦋10 ou 🐘 5 → borboleta 10x, elefante 5x
 * 3. Número + emoji: 10🦋 → borboleta 10x
 * 4. Mistura: 🐷🐷🐷 🐘🐘 → porco 3x, elefante 2x
 *
 * Retorna array de {bicho, quantidade, nome} ou [] se nada encontrado.
 */
// ========== FIX v17.0: lookup de emoji normalizado ==========
// Remove \uFE0F (variation selector) que WhatsApp adiciona automaticamente
// Ex: 🐈\uFE0F não batia no mapa → agora normaliza antes de buscar
function lookupEmoji(raw) {
    if (!raw) return null;
    // Tenta o token exato primeiro
    if (EMOJI_PARA_CODIGO[raw]) return EMOJI_PARA_CODIGO[raw];
    // Sem variation selector
    const sem = raw.replace(/\uFE0F/g, '');
    if (EMOJI_PARA_CODIGO[sem]) return EMOJI_PARA_CODIGO[sem];
    // Com variation selector (alguns emojis precisam)
    const com = raw + '\uFE0F';
    if (EMOJI_PARA_CODIGO[com]) return EMOJI_PARA_CODIGO[com];
    return null;
}

function extrairApostasDeEmojis(texto) {
    if (!texto || texto.trim().length === 0) return [];

    const apostas = [];
    const processadas = new Set();

    // FIX v17.0: regex mais abrangente + normalize variation selectors
    // Captura emojis simples, compostos (ZWJ), com skin tone, com \uFE0F
    const regexEmoji = /(?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)|\d+/gu;

    const tokens = [];
    let match;
    while ((match = regexEmoji.exec(texto)) !== null) {
        tokens.push(match[0]);
    }

    if (tokens.length === 0) return [];

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];
        const codigoEmoji = lookupEmoji(token);

        if (codigoEmoji) {
            // Conta repetições consecutivas do mesmo bicho (mesmo token normalizado)
            let count = 1;
            while (i + count < tokens.length && lookupEmoji(tokens[i + count]) === codigoEmoji) {
                count++;
            }
            i += count;

            // Se número DEPOIS dos emojis → usa como quantidade
            let quantidade = count;
            if (i < tokens.length) {
                const proxNum = parseInt(tokens[i]);
                if (!isNaN(proxNum) && proxNum > 0 && proxNum <= 100 && !lookupEmoji(tokens[i])) {
                    quantidade = proxNum;
                    i++;
                }
            }

            if (!processadas.has(codigoEmoji)) {
                apostas.push({ bicho: codigoEmoji, quantidade, nome: BICHOS[codigoEmoji].nome });
                processadas.add(codigoEmoji);
            } else {
                const existente = apostas.find(a => a.bicho === codigoEmoji);
                if (existente) existente.quantidade += quantidade;
            }
            continue;
        }

        // Token é número — verifica se PRÓXIMO é emoji (padrão: N🐷)
        const num = parseInt(token);
        if (!isNaN(num) && num > 0 && num <= 100 && i + 1 < tokens.length) {
            const codigoProx = lookupEmoji(tokens[i + 1]);
            if (codigoProx) {
                if (!processadas.has(codigoProx)) {
                    apostas.push({ bicho: codigoProx, quantidade: num, nome: BICHOS[codigoProx].nome });
                    processadas.add(codigoProx);
                } else {
                    const ex = apostas.find(a => a.bicho === codigoProx);
                    if (ex) ex.quantidade += num;
                }
                i += 2;
                continue;
            }
        }

        i++;
    }

    return apostas;
}

/**
 * NOVO v14.0 - detectarMensagemEmoji
 *
 * Retorna true se a mensagem parece ser uma aposta via emoji
 * (contém pelo menos 1 emoji de bicho, com ou sem número)
 */
function detectarMensagemEmoji(texto) {
    if (!texto) return false;
    const regexEmoji = /(?:\p{Extended_Pictographic}\uFE0F?(?:\u200D\p{Extended_Pictographic}\uFE0F?)*)/gu;
    let match;
    while ((match = regexEmoji.exec(texto)) !== null) {
        if (lookupEmoji(match[0])) return true;
    }
    return false;
}

// ========== CONFIGURAÇÃO ==========
let config = {
    titulo: 'WG PREMIAÇÕES',
    cotasPorBicho: 10,
    maxApostaPorBicho: 10,
    precoPorCota: 0.25,
    premiacaoPorCota: 5.25,
    premiacaoBanca: 5.00,
    premiacaoDezena: 20.00,
    pixKey: process.env.PIX_KEY || '06286052500',
    pixNome: process.env.PIX_NOME || 'Giselle Muniz',
    pixBanco: 'CLOUDBANK',
    admins: ['81965172670689@lid', '71481660801084@lid', '557199465875@c.us'],
    rifaAtiva: false,
    grupoNotificacao: null,
    horarioManual: null,
    dataManual: null,
    notifAuto: false,
    notifIntervalo: 2,
    notifMensagem: 'qual bicho eu marco pra você? 🤑',
    notifGrupoId: null
};

// ========== CONTROLE DE FLUXO ==========
let ultimaAtualizacao = 0;
const DELAY_ATUALIZACAO = 45 * 1000;
let filaAtualizacao = false;
const userCooldowns = new Map();
const COOLDOWN_TIME = 0;
let pedidosPendentesCache = new Map();
let notifTimer = null;

// ========== FUNÇÕES DE SISTEMA ==========

function ensureDirectories() {
    [DATA_DIR, AUTH_DIR, LOGS_DIR, BACKUP_DIR].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            logger.info(`📁 Diretório criado: ${dir}`);
        }
    });
    // Limpa logs e backups antigos para não encher o disco
    limparEspaco();
}

function limparEspaco() {
    try {
        // Limpa logs — mantém apenas últimos 500KB
        const logFiles = [path.join(LOGS_DIR, 'combined.log'), path.join(LOGS_DIR, 'error.log')];
        logFiles.forEach(logFile => {
            try {
                if (fs.existsSync(logFile)) {
                    const stat = fs.statSync(logFile);
                    if (stat.size > 500 * 1024) { // > 500KB
                        fs.writeFileSync(logFile, ''); // Zera o arquivo
                        logger.info('🧹 Log zerado: ' + logFile);
                    }
                }
            } catch (e) {}
        });

        // Mantém apenas os 3 backups mais recentes
        if (fs.existsSync(BACKUP_DIR)) {
            const backups = fs.readdirSync(BACKUP_DIR)
                .map(name => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtime }))
                .sort((a, b) => b.time - a.time);
            if (backups.length > 3) {
                backups.slice(3).forEach(b => {
                    try { fs.rmSync(path.join(BACKUP_DIR, b.name), { recursive: true, force: true }); } catch (e) {}
                });
                logger.info('🧹 Backups antigos removidos');
            }
        }
    } catch (e) { logger.error('Erro ao limpar espaço:', e.message); }
}

function backupData() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(BACKUP_DIR, timestamp);
        if (!fs.existsSync(backupPath)) fs.mkdirSync(backupPath, { recursive: true });
        ['rifa.json','banca.json','config.json','grupo.json','resultados.json'].forEach(file => {
            const src = path.join(DATA_DIR, file);
            const dest = path.join(backupPath, file);
            if (fs.existsSync(src)) fs.copyFileSync(src, dest);
        });
        const backups = fs.readdirSync(BACKUP_DIR)
            .map(name => ({ name, time: fs.statSync(path.join(BACKUP_DIR, name)).mtime }))
            .sort((a, b) => b.time - a.time);
        if (backups.length > 3) {
            backups.slice(3).forEach(b => {
                fs.rmSync(path.join(BACKUP_DIR, b.name), { recursive: true, force: true });
            });
        }
        logger.info('💾 Backup realizado com sucesso');
    } catch (e) {
        logger.error('❌ Erro no backup:', e);
    }
}
setInterval(backupData, 30 * 60 * 1000);

function checkCooldown(userId, comando) {
    const key = `${userId}:${comando}`;
    const ultimoUso = userCooldowns.get(key);
    const agora = Date.now();
    if (ultimoUso && (agora - ultimoUso) < COOLDOWN_TIME) {
        const tempoRestante = Math.ceil((COOLDOWN_TIME - (agora - ultimoUso)) / 1000);
        return { allowed: false, tempoRestante };
    }
    userCooldowns.set(key, agora);
    return { allowed: true };
}

function cleanAllLocks() {
    try {
        // Deleta recursivamente todos os SingletonLock dentro de AUTH_DIR
        function deleteLockRecursive(dir) {
            if (!fs.existsSync(dir)) return;
            try {
                const items = fs.readdirSync(dir);
                items.forEach(item => {
                    const fullPath = path.join(dir, item);
                    if (item === 'SingletonLock' || item === 'SingletonCookie' || item === 'SingletonSocket') {
                        try { fs.unlinkSync(fullPath); logger.info('🔓 Lock removido: ' + fullPath); } catch (e) {}
                        try { fs.rmSync(fullPath, { force: true }); } catch (e) {}
                    } else {
                        try {
                            const stat = fs.statSync(fullPath);
                            if (stat.isDirectory()) deleteLockRecursive(fullPath);
                        } catch (e) {}
                    }
                });
            } catch (e) {}
        }
        deleteLockRecursive(AUTH_DIR);

        // Limpa /tmp do chromium
        try {
            fs.readdirSync('/tmp').forEach(file => {
                if (file.includes('chromium') || file.includes('chrome') || file.includes('puppeteer') || file.startsWith('.org.chromium')) {
                    try { fs.rmSync(path.join('/tmp', file), { recursive: true, force: true }); } catch (e) {}
                }
            });
        } catch (e) {}
    } catch (e) { logger.error('Erro ao limpar locks:', e); }
}

// ========== PERSISTÊNCIA ==========

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            config = { ...config, ...savedConfig };
            if (!config.admins.includes('81965172670689@lid')) config.admins.push('81965172670689@lid');
            if (!config.admins.includes('71481660801084@lid')) config.admins.push('71481660801084@lid');
            if (!config.admins.includes('557199465875@c.us')) config.admins.push('557199465875@c.us');

            // FIX: Se notifGrupoId não está no config.json, tenta recuperar do grupo.json
            if (!config.notifGrupoId || !config.grupoNotificacao) {
                const grupo = loadGrupo();
                if (grupo && grupo.grupoId) {
                    config.notifGrupoId = config.notifGrupoId || grupo.grupoId;
                    config.grupoNotificacao = config.grupoNotificacao || grupo.grupoId;
                    logger.info('✅ notifGrupoId recuperado do grupo.json: ' + config.notifGrupoId);
                }
            }

            logger.info('✅ Config carregada | notifAuto=' + config.notifAuto + ' | grupoId=' + (config.notifGrupoId || 'não definido'));
        } else {
            logger.info('⚠️ Config não existe, usando padrão');
            saveConfig();
        }
    } catch (e) { logger.error('❌ Erro ao carregar config:', e.message); }
}

function saveConfig() {
    try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2)); } catch (e) { logger.error('❌ Erro ao salvar config:', e.message); }
}

function loadGrupo() {
    try {
        if (fs.existsSync(GRUPO_FILE)) return JSON.parse(fs.readFileSync(GRUPO_FILE, 'utf8'));
    } catch (e) { logger.error('Erro ao carregar grupo:', e.message); }
    return { grupoId: null };
}

function saveGrupo(grupo) {
    try { fs.writeFileSync(GRUPO_FILE, JSON.stringify(grupo, null, 2)); } catch (e) { logger.error('Erro ao salvar grupo:', e.message); }
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            Object.keys(BICHOS).forEach(g => {
                if (!data[g]) data[g] = { cotasDisponiveis: config.cotasPorBicho, cotasVendidas: 0, apostas: [] };
            });
            return data;
        }
    } catch (e) { logger.error('❌ Erro ao carregar data:', e.message); }
    return createNewRifaData();
}

function createNewRifaData() {
    const novoData = { apostas: [], status: 'aberta', createdAt: new Date().toISOString(), resultados: {} };
    Object.keys(BICHOS).forEach(g => {
        novoData[g] = { cotasDisponiveis: config.cotasPorBicho, cotasVendidas: 0, apostas: [] };
    });
    saveData(novoData);
    return novoData;
}

function saveData(d) {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2));
    } catch (e) { logger.error('❌ Erro ao salvar data:', e.message); }
}

function loadBanca() {
    try {
        if (fs.existsSync(BANCA_FILE)) return JSON.parse(fs.readFileSync(BANCA_FILE, 'utf8'));
    } catch (e) { logger.error('Erro ao carregar banca:', e.message); }
    return { pendentes: [], aprovados: [], contadorId: 1000 };
}

function saveBanca(b) {
    try { fs.writeFileSync(BANCA_FILE, JSON.stringify(b, null, 2)); } catch (e) { logger.error('Erro ao salvar banca:', e.message); }
}

function loadResultados() {
    try {
        if (fs.existsSync(RESULTADOS_FILE)) return JSON.parse(fs.readFileSync(RESULTADOS_FILE, 'utf8'));
    } catch (e) { logger.error('Erro ao carregar resultados:', e.message); }
    return { historico: [] };
}

function saveResultados(r) {
    try { fs.writeFileSync(RESULTADOS_FILE, JSON.stringify(r, null, 2)); } catch (e) { logger.error('Erro ao salvar resultados:', e.message); }
}

// ========== UTILITÁRIOS ==========

function getDataHoraAtual() {
    const a = new Date();
    return new Date(a.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

function isAdmin(id) {
    if (!id) return false;
    const normalizedId = id.toString().trim();
    if (config.admins.includes(normalizedId)) return true;
    const idNumber = normalizedId.replace(/\D/g, '');
    const SEU_NUMERO = '81965172670689';
    const DONO = '71481660801084';
    const NOVO_ADMIN = '557199465875';
    const checks = [
        // Admin original
        idNumber === SEU_NUMERO,
        idNumber.includes(SEU_NUMERO),
        (SEU_NUMERO.includes(idNumber) && idNumber.length > 8),
        idNumber === '55' + SEU_NUMERO,
        idNumber.includes('55' + SEU_NUMERO),
        normalizedId.includes(SEU_NUMERO),
        normalizedId === '81965172670689@lid',
        // ===== DONO (ID real do grupo) =====
        idNumber === DONO,
        idNumber.includes(DONO),
        (DONO.includes(idNumber) && idNumber.length > 8),
        normalizedId.includes(DONO),
        normalizedId === '71481660801084@lid',
        normalizedId === '71481660801084@c.us',
        // ===== NOVO ADMIN =====
        idNumber === NOVO_ADMIN,
        idNumber.includes(NOVO_ADMIN),
        (NOVO_ADMIN.includes(idNumber) && idNumber.length > 8),
        normalizedId.includes(NOVO_ADMIN),
        normalizedId === '557199465875@c.us',
        normalizedId === '557199465875@lid'
    ];
    return checks.some(c => c);
}

function getUserNumber(m) {
    return (m.author || m.from).split('@')[0];
}

// ========== FIX v16.0: Comparação robusta de userId ==========
// Compara IDs ignorando variantes @lid/@c.us e diferenças de código de país
function matchUserId(storedId, storedNumero, searchUserId) {
    if (!storedId && !storedNumero) return false;
    const normalizar = (s) => (s || '').replace(/\D/g, '');
    const searchNum = normalizar((searchUserId || '').split('@')[0]);
    const storedNum = normalizar((storedId || '').split('@')[0]);
    const storedNumNorm = normalizar(storedNumero || '');
    if (!searchNum || searchNum.length < 6) return false;
    // Comparação exata de ID
    if (storedId === searchUserId) return true;
    // Variante @lid vs @c.us
    const searchAlt = (searchUserId || '').endsWith('@c.us')
        ? searchUserId.replace('@c.us', '@lid')
        : (searchUserId || '').replace('@lid', '@c.us');
    if (storedId === searchAlt) return true;
    // Sufixo de 9 dígitos (tolera diferença de DDI)
    const suf9 = (s) => s.slice(-9);
    const sufSearch = suf9(searchNum);
    if (sufSearch.length >= 8) {
        if (suf9(storedNum) === sufSearch) return true;
        if (suf9(storedNumNorm) === sufSearch) return true;
    }
    // Número puro igual
    if (storedNumNorm && storedNumNorm === searchNum) return true;
    return false;
}

async function getContactName(m) {
    try {
        const c = await m.getContact();
        return c.pushname || c.name || getUserNumber(m);
    } catch (e) { return getUserNumber(m); }
}

function gerarIdBanca(b) {
    b.contadorId++;
    saveBanca(b);
    return 'B' + b.contadorId;
}

// ========== PROCESSAMENTO DE TEXTO ==========

function detectarOfertaFechamento(texto) {
    const limpo = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const padroesFechamento = [
        /(\d+)[\s]*[r$]?[\s]*(?:reais?)?[\s]*(?:quem|qm)?[\s]*fecha/i,
        /(?:quem|qm)[\s]*fecha[\s]*(?:por)?[\s]*(\d+)[\s]*[r$]?/i,
        /(\d+)[\s]*[r$][\s]*(?:quem|qm)[\s]*fecha/i,
        /fecha[\s]*(?:por)?[\s]*(\d+)[\s]*[r$]?/i,
        /(\d+)[\s]*bichos?[\s]*(?:quem|qm)?[\s]*fecha/i,
        /(?:sobraram?|faltam?|restam?)[\s]*(\d+)[\s]*(?:bichos?)?/i
    ];
    for (let padrao of padroesFechamento) {
        const match = limpo.match(padrao);
        if (match) return { ehOferta: true, quantidade: parseInt(match[1]), textoOriginal: texto };
    }
    if (/quem fecha|qm fecha|fecha a rifa|fechar rifa/i.test(limpo)) {
        return { ehOferta: true, quantidade: null, textoOriginal: texto };
    }
    return { ehOferta: false };
}

function detectarTodosBichos(texto) {
    // FIX v15.0: DESATIVADO - causava bug ao apostar todos os bichos automaticamente
    // A opção de "pedir todos" foi removida para evitar apostas acidentais
    return false;
}

function separarRifaBanca(texto) {
    const limpo = texto.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s\d]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const comandosParaRemover = ['colocar', 'resultado', 'notificar', 'notificartodos'];
    let textoLimpo = limpo;
    comandosParaRemover.forEach(cmd => {
        if (textoLimpo.startsWith(cmd + ' ') || textoLimpo === cmd) {
            textoLimpo = textoLimpo.substring(cmd.length).trim();
        }
    });

    const tokens = textoLimpo.split(/\s+/).filter(t => t.length > 0);
    const itensRifa = [], itensBanca = [];
    const processadasRifa = new Set(), processadasBanca = new Set();

    let i = 0;
    while (i < tokens.length) {
        const token = tokens[i];

        if (token === 'banca') {
            i++;
            if (i >= tokens.length) break;

            const proxNum = parseInt(tokens[i]);
            if (!isNaN(proxNum) && proxNum > 0 && proxNum <= 100) {
                if (i + 1 < tokens.length) {
                    let nomeB = tokens[i + 1];
                    if (nomeB === 'banca') { i++; continue; }
                    if (nomeB.endsWith('s') && !NOME_PARA_CODIGO[nomeB]) nomeB = nomeB.slice(0, -1);
                    const codB = NOME_PARA_CODIGO[nomeB];
                    if (codB) {
                        if (!processadasBanca.has(codB)) {
                            itensBanca.push({ bicho: codB, quantidade: proxNum, nome: BICHOS[codB].nome });
                            processadasBanca.add(codB);
                        }
                        i += 2; continue;
                    }
                }
                i++; continue;
            } else {
                if (tokens[i] === 'banca') { continue; }
                let nomeB = tokens[i];
                if (nomeB.endsWith('s') && !NOME_PARA_CODIGO[nomeB]) nomeB = nomeB.slice(0, -1);
                const codB = NOME_PARA_CODIGO[nomeB];
                if (codB) {
                    let qtd = 1;
                    if (i + 1 < tokens.length) {
                        const pn = parseInt(tokens[i + 1]);
                        const pbNome = tokens[i + 1];
                        if (!isNaN(pn) && pn > 0 && pn <= 100 && !NOME_PARA_CODIGO[pbNome] && pbNome !== 'banca') {
                            qtd = pn; i++;
                        }
                    }
                    if (!processadasBanca.has(codB)) {
                        itensBanca.push({ bicho: codB, quantidade: qtd, nome: BICHOS[codB].nome });
                        processadasBanca.add(codB);
                    }
                    i++; continue;
                }
            }
            continue;
        }

        const numVal = parseInt(token);
        if (!isNaN(numVal) && numVal > 0 && numVal <= 100) {
            if (i + 1 < tokens.length) {
                let nomeB = tokens[i + 1];
                if (nomeB === 'banca') { i++; continue; }
                if (nomeB.endsWith('s') && !NOME_PARA_CODIGO[nomeB]) nomeB = nomeB.slice(0, -1);
                const codB = NOME_PARA_CODIGO[nomeB];
                if (codB && !processadasRifa.has(codB)) {
                    itensRifa.push({ bicho: codB, quantidade: numVal, nome: BICHOS[codB].nome });
                    processadasRifa.add(codB); i += 2; continue;
                }
            }
            i++; continue;
        }

        let nomeB = token;
        if (nomeB.endsWith('s') && !NOME_PARA_CODIGO[nomeB]) nomeB = nomeB.slice(0, -1);
        const codB = NOME_PARA_CODIGO[nomeB];
        if (codB && !processadasRifa.has(codB)) {
            let qtd = 1;
            if (i + 1 < tokens.length) {
                const pn = parseInt(tokens[i + 1]);
                const pbNome = tokens[i + 1];
                if (!isNaN(pn) && pn > 0 && pn <= 100 && !NOME_PARA_CODIGO[pbNome] && pbNome !== 'banca') {
                    qtd = pn; i++;
                }
            }
            itensRifa.push({ bicho: codB, quantidade: qtd, nome: BICHOS[codB].nome });
            processadasRifa.add(codB); i++; continue;
        }

        i++;
    }

    return { itensRifa, itensBanca };
}

function extrairApostasFlexivel(texto) {

    // ================================================================
    // FIX v16.0: FILTROS RIGOROSOS - bloqueia mensagens não-apostas
    // ================================================================

    if (!texto || !texto.trim()) return [];

    // 1. Bloqueia comandos explícitos (incluindo multilinhas onde 1ª linha é comando)
    const primeiraLinha = texto.trim().split(/\n/)[0].trim();
    const primeiraLinhaLimpa = primeiraLinha.toLowerCase().replace(/^[!/]/, '').trim();
    const COMANDOS_BLOQUEADOS = [
        'cancelar','cancela','cancelartodos','all','todos','mencionar',
        'notificar','notificartodos','notifauto','resultado','saiu','deu','sorteio',
        'ganhou','iniciar','reset','resetar','abrir','fechar','atualizar',
        'debug','pendentes','colocar','colocarbanca','cancelarbanca','adicionar',
        'ok','pago','paguei','meus','minhas','valores','total','banca','dezena',
        'meuid','status','ajuda','comandos','help','disponivel','grupo','addadmin',
        'quantidade','qtde','historico','resultados','minhabanca','pagobanca',
        'aprovar','recusar','notifauto'
    ];
    if (COMANDOS_BLOQUEADOS.some(c =>
        primeiraLinhaLimpa === c ||
        primeiraLinhaLimpa.startsWith(c + ' ') ||
        primeiraLinhaLimpa.startsWith(c + '\n')
    )) return [];

    // 2. Normaliza para detecção de padrões de bloqueio
    const textoLimpo = texto.toLowerCase().trim();

    // 3. BLOQUEIA qualquer mensagem com "?" (perguntas NUNCA são apostas)
    if (textoLimpo.includes('?')) return [];

    // 4. Bloqueia padrões de mensagem casual/pergunta/comentário
    const PADROES_BLOQUEIO = [
        /^(n|nao|não|num|nenhum|sem)\s+(tem|há|ha|existe|sobrou|restou|ficou)/i,
        /^(tem|há|ha|existe|sobrou|restou|ficou|ainda)\s+/i,
        /^(quantos?|quanto|qual|quais|como|quando|onde|por que|porque|quem|qm)\b/i,
        /^(fechei|fechou|fecho|fechoi)\s/i,
        /^@/,
        /^(ok|ja|já|sim|nao|não|blz|beleza|entendi|certo|ótimo|otimo|obrigad)/i,
        /^(ta|tá|tao|tão|to|tô)\s+(pago|bom|certo|ok)/i,
        /^(boa|bom)\s+(dia|tarde|noite|sorte)/i,
        /^(oi|olá|ola|tudo|tchau)\b/i,
        // Palavras de pergunta em QUALQUER posição
        /\b(qm|quem|quando|onde|como|porque|por que|quanto|quantos)\b/i,
        // Frases típicas de comentário sobre a rifa
        /\b(quem fecha|qm fecha|quem pega|quem quer|tem sorte|boa sorte|fecha a rifa)\b/i,
        /\b(sobrou|restou|ficou|esgotou|acabou)\b/i,
        // Mensagem começa com número de Reais (valor, não quantidade)
        /^\d+\s*r\$\s*/i,
        /^\d+\s*reais?\b/i,
    ];
    if (PADROES_BLOQUEIO.some(p => p.test(textoLimpo))) return [];

    // 5. Bloqueia só número solto
    if (/^\d+$/.test(textoLimpo)) return [];

    // ================================================================
    // EXTRAÇÃO DE APOSTAS - exige BICHO + NÚMERO obrigatoriamente
    // ================================================================

    const resultados = [];
    const processadas = new Set();

    // Normaliza: remove pontuação (mantém letras, números, espaços)
    const textoNorm = texto.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[,;:\n]/g, ' ')
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Remove comandos do início
    let limpo = textoNorm;
    const CMDS_REMOVER = ['colocar', 'banca', 'dezena', 'notificar', 'notificartodos', 'resultado'];
    CMDS_REMOVER.forEach(cmd => {
        if (limpo.startsWith(cmd + ' ') || limpo === cmd) {
            limpo = limpo.substring(cmd.length).trim();
        }
    });
    limpo = limpo.replace(/\bbanca\b/g, ' ').replace(/\s+/g, ' ').trim();

    // ── Padrão 1: "N bicho" ou "N x bicho"  (ex: "6 avestruz", "3x vaca")
    const p1 = /(\d+)\s*x?\s+([a-z]+)/g;
    let m;
    while ((m = p1.exec(limpo)) !== null) {
        const q = parseInt(m[1]);
        let n = m[2].trim();
        const nSemS = n.endsWith('s') ? n.slice(0,-1) : n;
        const b = NOME_PARA_CODIGO[n] || NOME_PARA_CODIGO[nSemS];
        if (b && q >= 1 && q <= 100 && !processadas.has(b)) {
            resultados.push({ bicho: b, quantidade: q, nome: BICHOS[b].nome });
            processadas.add(b);
        }
    }

    // ── Padrão 2: "bicho N" ou "bicho Nx"  (ex: "vaca 5", "elefante 3x")
    const p2 = /([a-z]+)\s+(\d+)\s*x?(?!\d)/g;
    while ((m = p2.exec(limpo)) !== null) {
        let n = m[1].trim();
        const nSemS = n.endsWith('s') ? n.slice(0,-1) : n;
        const q = parseInt(m[2]);
        const b = NOME_PARA_CODIGO[n] || NOME_PARA_CODIGO[nSemS];
        if (b && q >= 1 && q <= 100 && !processadas.has(b)) {
            resultados.push({ bicho: b, quantidade: q, nome: BICHOS[b].nome });
            processadas.add(b);
        }
    }

    // ── Padrão 3: "G01 5" ou "g12 3"
    const p3 = /\bg?(\d{1,2})\s+(\d+)\b/g;
    while ((m = p3.exec(limpo)) !== null) {
        const cod = 'G' + m[1].padStart(2,'0');
        const q = parseInt(m[2]);
        if (BICHOS[cod] && q >= 1 && q <= 100 && !processadas.has(cod)) {
            resultados.push({ bicho: cod, quantidade: q, nome: BICHOS[cod].nome });
            processadas.add(cod);
        }
    }

    // ── Padrão 4: "bicho bicho N cada" (ex: "vaca cobra 3 cada")
    const matchCada = limpo.match(/^((?:[a-z]+\s+)+?)(\d+)\s*(?:x\s*)?(?:cada|em cada|por cada|pra cada)$/i);
    if (matchCada) {
        const qtd = parseInt(matchCada[1]);
        matchCada[1].trim().split(/\s+/).forEach(p => {
            const nSemS = p.endsWith('s') ? p.slice(0,-1) : p;
            const b = NOME_PARA_CODIGO[p] || NOME_PARA_CODIGO[nSemS];
            if (b && !processadas.has(b)) {
                resultados.push({ bicho: b, quantidade: qtd, nome: BICHOS[b].nome });
                processadas.add(b);
            }
        });
    }

    // ── NOTA: "Só nome" (sem número) foi REMOVIDO intencionalmente
    // Registrava apostas a partir de qualquer menção casual de bicho no texto.
    // Agora, para apostar em 1 cota, o usuário deve escrever "bicho 1" explicitamente.

    return resultados;
}

function detectarComandoResultado(texto) {
    const limpo = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    const padroesResultado = [
        /^resultado\s+(.+)$/i,
        /^saiu\s+(.+)$/i,
        /^sorteio\s+(.+)$/i,
        /^bicho\s+sorteado\s+(.+)$/i,
        /^ganhou\s+(.+)$/i,
        /^deu\s+(.+)$/i,
        /^saiu\s+o\s+(.+)$/i,
        /^resultado[:]\s*(.+)$/i,
    ];

    for (let padrao of padroesResultado) {
        const match = limpo.match(padrao);
        if (match) {
            const termoBicho = match[1].trim().replace(/[^\w\s]/g, '').trim();
            const codigo = encontrarBichoNoTexto(termoBicho);
            if (codigo) return { ehResultado: true, codigo, dezena: null };

            const dezenaMatch = termoBicho.match(/^(\d{2})$/);
            if (dezenaMatch) {
                const dez = dezenaMatch[1];
                const codDezena = DEZENA_PARA_BICHO[dez];
                if (codDezena) return { ehResultado: true, codigo: codDezena, dezena: dez };
            }
        }
    }

    return { ehResultado: false };
}

function encontrarBichoNoTexto(texto) {
    const limpo = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    if (NOME_PARA_CODIGO[limpo]) return NOME_PARA_CODIGO[limpo];
    const semS = limpo.endsWith('s') ? limpo.slice(0, -1) : limpo;
    if (NOME_PARA_CODIGO[semS]) return NOME_PARA_CODIGO[semS];
    const codigoMatch = limpo.match(/^g?(\d{1,2})$/);
    if (codigoMatch) {
        const cod = 'G' + codigoMatch[1].padStart(2, '0');
        if (BICHOS[cod]) return cod;
    }
    const palavras = limpo.split(/\s+/);
    for (let p of palavras) {
        if (NOME_PARA_CODIGO[p]) return NOME_PARA_CODIGO[p];
        const ps = p.endsWith('s') ? p.slice(0, -1) : p;
        if (NOME_PARA_CODIGO[ps]) return NOME_PARA_CODIGO[ps];
    }
    return null;
}

// ========== LÓGICA DA RIFA ==========

function verificarRifaAutomatica() {
    const agora = getDataHoraAtual();
    const diaSemana = agora.getDay();
    const hora = agora.getHours();
    const minuto = agora.getMinutes();
    const minutosTotal = hora * 60 + minuto;

    if (config.horarioManual && config.dataManual) {
        return {
            tipo: config.horarioManual === '20:00' ? 'FEDERAL' : 'BAHIA',
            horario: config.horarioManual,
            data: config.dataManual,
            ativa: true,
            manual: true
        };
    }

    if (diaSemana === 3 || diaSemana === 6) {
        const inicioFederal = 10 * 60;
        const fimFederal = 20 * 60 + 30;
        if (minutosTotal >= inicioFederal && minutosTotal < fimFederal) {
            const dataHoje = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            return { tipo: 'FEDERAL', horario: '20:00', data: dataHoje, ativa: true };
        }
    }

    for (let i = 0; i < HORARIOS_BAHIA.length; i++) {
        const [h, m] = HORARIOS_BAHIA[i].split(':').map(Number);
        const horarioMinutos = h * 60 + m;
        const inicio = horarioMinutos - 30;
        const fim = horarioMinutos + 30;
        if (minutosTotal >= inicio && minutosTotal < fim) {
            const dataHoje = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
            return { tipo: 'BAHIA', horario: HORARIOS_BAHIA[i], data: dataHoje, ativa: true };
        }
    }

    let proximoHorario = null;
    let proximaData = agora;
    for (let i = 0; i < HORARIOS_BAHIA.length; i++) {
        const [h, m] = HORARIOS_BAHIA[i].split(':').map(Number);
        const horarioMinutos = h * 60 + m;
        if (minutosTotal < horarioMinutos - 30) { proximoHorario = HORARIOS_BAHIA[i]; break; }
    }
    if (!proximoHorario) {
        proximaData = new Date(agora);
        proximaData.setDate(proximaData.getDate() + 1);
        proximoHorario = '10:20';
    }
    const dataStr = proximaData.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return { tipo: 'BAHIA', horario: proximoHorario, data: dataStr, ativa: false, proximo: true };
}

function verificarEsgotamento(data) {
    let totalBichos = 0, bichosEsgotados = 0;
    Object.keys(BICHOS).forEach(codigo => {
        totalBichos++;
        const info = data[codigo];
        if (info && info.cotasDisponiveis === 0) bichosEsgotados++;
    });
    return { total: totalBichos, esgotados: bichosEsgotados, esgotou: bichosEsgotados === totalBichos };
}

async function fecharRifaAutomaticamente(chat, data) {
    data.status = 'fechada';
    data.dataFechamento = new Date().toISOString();
    data.motivoFechamento = 'Todos os bichos esgotados';
    saveData(data);
    logger.info('🔄 RIFA FECHADA AUTOMATICAMENTE');
    // Fechar grupo para somente admins
    try {
        const grupoConfig = loadGrupo();
        if (grupoConfig && grupoConfig.grupoId) {
            const grupoChat = await client.getChatById(grupoConfig.grupoId);
            await grupoChat.setMessagesAdminsOnly(true);
            logger.info('🔒 Grupo FECHADO automaticamente');
        }
    } catch (e) { logger.error('Erro ao fechar grupo automaticamente:', e.message); }
    const mensagem =
        '🔒 *RIFA ENCERRADA!* 🔒\n\n' +
        '✅ Todos os bichos foram vendidos!\n\n' +
        '🏦 Agora só aceitamos pedidos para *BANCA*:\n' +
        '• Use: banca [bicho] [quantidade]\n' +
        '• Exemplo: banca vaca 5 leao 3\n\n' +
        '💰 R$ 0,25 → R$ 5,00 (bicho)\n' +
        '💰 R$ 0,25 → R$ 20,00 (dezena)\n\n' +
        'Boa sorte no sorteio! 🍀';
    try {
        await chat.sendMessage(mensagem);
        for (const adm of config.admins) {
            try {
                const c = await client.getChatById(adm);
                await c.sendMessage('📢 *RIFA FECHADA AUTOMATICAMENTE*\n\nTodos os 25 bichos foram esgotados.\nAgora só aceitando pedidos de BANCA.\n\nPara reabrir: !abrir');
            } catch (e) {}
        }
    } catch (e) { logger.error('Erro ao notificar fechamento:', e); }
}

// ========== RESULTADO E GANHADORES ==========

async function processarResultado(msg, codigoBicho, dezenaOpcional, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode anunciar resultado!');

    const bicho = BICHOS[codigoBicho];
    if (!bicho) return msg.reply('❌ Bicho não encontrado. Verifique o nome.');

    const data = loadData();
    const banca = loadBanca();
    const rifaInfo = verificarRifaAutomatica();
    const agora = getDataHoraAtual();

    const dezenasVencedoras = dezenaOpcional ? [dezenaOpcional] : bicho.dezenas;

    logger.info(`🏆 RESULTADO ANUNCIADO: ${bicho.nome} (${codigoBicho}) | Dezenas: ${dezenasVencedoras.join(', ')}`);

    // ========== BUSCAR GANHADORES ==========
    const todosGanhadores = [];
    
    // Ganhadores da RIFA
    data.apostas.filter(a => a.bicho === codigoBicho && !a.cancelada && (a.pago === true || a.pago === 'true')).forEach(a => {
        const premio = a.cotas * config.premiacaoPorCota;
        todosGanhadores.push({
            userId: a.userId,
            nome: a.nome,
            numero: a.numeroUsuario,
            cotas: a.cotas,
            premio: premio,
            tipo: 'RIFA'
        });
    });

    // Ganhadores da BANCA (bicho)
    banca.aprovados.filter(p => p.tipo === 'banca' && (p.pago === true || p.pago === 'true')).forEach(p => {
        p.itens.forEach(item => {
            if (item.bicho === codigoBicho) {
                const premio = item.cotas * config.premiacaoBanca;
                todosGanhadores.push({
                    userId: p.userId,
                    nome: p.nome,
                    numero: p.numero,
                    cotas: item.cotas,
                    premio: premio,
                    tipo: 'BANCA'
                });
            }
        });
    });

    // Ganhadores da BANCA (dezena)
    banca.aprovados.filter(p => p.tipo === 'dezena' && (p.pago === true || p.pago === 'true')).forEach(p => {
        p.dezenas.forEach(d => {
            if (dezenasVencedoras.includes(d.dezena)) {
                const premio = d.cotas * config.premiacaoDezena;
                todosGanhadores.push({
                    userId: p.userId,
                    nome: p.nome,
                    numero: p.numero,
                    cotas: d.cotas,
                    premio: premio,
                    tipo: 'DEZENA',
                    dezena: d.dezena
                });
            }
        });
    });

    const totalGanhadores = todosGanhadores.length;
    const totalPremio = todosGanhadores.reduce((sum, g) => sum + g.premio, 0);

    // ========== SALVAR RESULTADO ==========
    const resultados = loadResultados();
    const registroResultado = {
        id: Date.now().toString(),
        data: agora.toLocaleDateString('pt-BR'),
        hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        horarioSorteio: rifaInfo.horario,
        bicho: codigoBicho,
        nomeBicho: bicho.nome,
        emojiBicho: bicho.emoji,
        dezenasVencedoras,
        anunciadoPor: adminId,
        ganhadores: todosGanhadores,
        totalGanhadores,
        totalPremio
    };
    resultados.historico.push(registroResultado);
    saveResultados(resultados);

    // ========== ANÚNCIO NO GRUPO (ÚNICO E RESUMIDO) ==========
    let anuncio = '🏆🎉🏆🎉🏆🎉🏆🎉🏆🎉🏆\n\n';
    anuncio += '*🎀💸 RESULTADO DO SORTEIO 💸🎀*\n\n';
    anuncio += `*⌚ Horário:* ${rifaInfo.horario}\n`;
    anuncio += `*📆 Data:* ${agora.toLocaleDateString('pt-BR')}\n\n`;
    anuncio += `*🏆 BICHO SORTEADO:*\n`;
    anuncio += `${bicho.emoji} *${bicho.nome.toUpperCase()}* ${bicho.emoji}\n`;
    anuncio += `*Grupo:* ${codigoBicho}\n`;
    anuncio += `*Dezenas:* ${bicho.dezenas.join(' | ')}\n\n`;

    if (totalGanhadores === 0) {
        anuncio += '😔 *Nenhum ganhador neste sorteio.*\n\n';
        anuncio += '🍀 Boa sorte na próxima! 🍀';
        await chat.sendMessage(anuncio);
        
        logger.info(`✅ Resultado: ${bicho.nome} | 0 ganhadores`);
        return;
    }

    // Lista resumida de ganhadores
    anuncio += `🎊 *${totalGanhadores} GANHADOR(ES)!* 🎊\n`;
    anuncio += `💰 *Total de prêmios:* R$ ${totalPremio.toFixed(2)}\n\n`;
    anuncio += '━━━━━━━━━━━━━━━━━━\n';
    anuncio += '*🏆 PARABÉNS AOS GANHADORES:*\n\n';

    // Coletar menções
    const mentions = [];

    // Agrupa ganhadores com o mesmo userId (pode ter rifa + banca)
    todosGanhadores.forEach((g, index) => {
        const mentionId = g.userId.includes('@') ? g.userId : g.userId + '@c.us';
        mentions.push(mentionId);

        // Exibe: número. Nome (@numero) → R$ valor (TIPO)
        anuncio += `${index + 1}. 🎉 *${g.nome}* (@${g.numero})\n`;
        anuncio += `   💰 R$ ${g.premio.toFixed(2)} — ${g.tipo}`;
        if (g.dezena) anuncio += ` [dezena ${g.dezena}]`;
        anuncio += '\n\n';
    });

    anuncio += '━━━━━━━━━━━━━━━━━━\n';
    anuncio += `🍀 _${config.titulo}_`;

    // Enviar APENAS UMA mensagem no grupo - SEM mensagens privadas
    try {
        await chat.sendMessage(anuncio, { mentions });
        logger.info(`✅ Resultado anunciado no grupo: ${bicho.nome} | ${totalGanhadores} ganhadores | R$ ${totalPremio.toFixed(2)}`);
    } catch (e) {
        logger.error('Erro ao enviar anúncio:', e);
        await chat.sendMessage(anuncio); // Tenta sem menções
    }

    // ========== RESUMO PARA ADMIN (privado) ==========
    await new Promise(resolve => setTimeout(resolve, 500));
    
    let resumoAdmin = `📊 *RESUMO DO RESULTADO*\n\n`;
    resumoAdmin += `Bicho: ${bicho.emoji} ${bicho.nome} (${codigoBicho})\n`;
    resumoAdmin += `Horário: ${rifaInfo.horario} | ${agora.toLocaleDateString('pt-BR')}\n`;
    resumoAdmin += `Total ganhadores: ${totalGanhadores}\n`;
    resumoAdmin += `Total a pagar: R$ ${totalPremio.toFixed(2)}\n\n`;

    // Detalhar por tipo
    const porTipo = {
        RIFA: todosGanhadores.filter(g => g.tipo === 'RIFA'),
        BANCA: todosGanhadores.filter(g => g.tipo === 'BANCA'),
        DEZENA: todosGanhadores.filter(g => g.tipo === 'DEZENA')
    };

    if (porTipo.RIFA.length > 0) {
        resumoAdmin += `🎟️ *RIFA (${config.premiacaoPorCota}x):*\n`;
        porTipo.RIFA.forEach(g => {
            resumoAdmin += `• ${g.nome} (${g.numero}) - ${g.cotas}x = R$ ${g.premio.toFixed(2)}\n`;
        });
        resumoAdmin += '\n';
    }

    if (porTipo.BANCA.length > 0) {
        resumoAdmin += `🏦 *BANCA (${config.premiacaoBanca}x):*\n`;
        porTipo.BANCA.forEach(g => {
            resumoAdmin += `• ${g.nome} (${g.numero}) - ${g.cotas}x = R$ ${g.premio.toFixed(2)}\n`;
        });
        resumoAdmin += '\n';
    }

    if (porTipo.DEZENA.length > 0) {
        resumoAdmin += `🎯 *DEZENA (${config.premiacaoDezena}x):*\n`;
        porTipo.DEZENA.forEach(g => {
            resumoAdmin += `• ${g.nome} (${g.numero}) - ${g.cotas}x [${g.dezena}] = R$ ${g.premio.toFixed(2)}\n`;
        });
    }

    // Enviar resumo apenas para admins (privado)
    for (const adm of config.admins) {
        try {
            const admChat = await client.getChatById(adm);
            await admChat.sendMessage(resumoAdmin);
        } catch (e) {
            logger.error(`Erro ao enviar resumo para admin ${adm}:`, e);
        }
    }

    logger.info(`✅ Resultado processado: ${bicho.nome} | ${totalGanhadores} ganhadores | R$ ${totalPremio.toFixed(2)}`);
}

async function listarResultados(msg, adminId) {
    const resultados = loadResultados();
    if (resultados.historico.length === 0) {
        return msg.reply('📭 Nenhum resultado registrado ainda.\n\nUse: *resultado [bicho]* para anunciar o sorteio.');
    }

    const ultimos = resultados.historico.slice(-5).reverse();
    let t = '📋 *ÚLTIMOS RESULTADOS*\n\n';
    ultimos.forEach((r, i) => {
        t += `${i + 1}. ${r.emojiBicho} *${r.nomeBicho}* - ${r.data} ${r.hora}\n`;
        t += `   ⏰ Sorteio: ${r.horarioSorteio} | 🏆 ${r.totalGanhadores} ganhador(es)\n\n`;
    });

    return msg.reply(t);
}

// ========== GERAÇÃO DE MENSAGENS ==========

function gerarDisponiveis(data, rifaInfo) {
    let t = '💰💰💰💰💰💰💰💰💰💰💰\n\n';
    t += '*💰𝗪𝗚 𝗣𝗥𝗘𝗠𝗜𝗔𝗖̧𝗢̃𝗘𝗦💰*\n\n';
    t += '     *⌚️' + rifaInfo.horario + '/ 📆' + rifaInfo.data + '*\n\n';
    t += '_*SINALIZEM A QUANTIDADE DESEJADA!*_\n\n';
    t += '*CADA BICHINHO 0,25 centavos!😉*\n\n';

    t += '*0,25/5,25🍀0,50/11,00*\n';
    t += '*0,75/16,25🍀1,00/22,00*\n';
    t += '*1,25/26,00🍀1,50/32,00*\n';
    t += '*1,75/36,00🍀2,00/42,00*\n';
    t += '*2,25/46,00🍀2,50/52,00*\n';
    t += '*2,75/56,00🍀3,00/62,00*\n\n';

    t += ' *🍀FAÇA SUA FEZINHA🍀*\n';
    t += '*GRUPOS DISPONÍVEIS* ⤵️\n';

    let bichosDisponiveis = 0;
    Object.keys(BICHOS).forEach(g => {
        const b = BICHOS[g];
        const i = data[g] || { cotasDisponiveis: config.cotasPorBicho };
        const d = i.cotasDisponiveis;
        if (d > 0) {
            bichosDisponiveis++;
            const num = g.replace('G', '');
            const numFormatado = num.padStart(2, '0');
            t += '🍀 *' + g + '*' + b.emoji.repeat(Math.min(d, 12)) + '\n';
        }
    });

    if (bichosDisponiveis === 0) {
        t += '\n*🔒 TODOS OS BICHOS ESGOTADOS!*\n';
        t += 'Use: *banca* para apostar na banca\n';
    }

    t += '\n*🚨OBS: SÓ PEÇA O BICHO SE FOR PAGAR, FIADO EU MSM GANHO😮‍💨*\n\n';
    t += '*🅟🅘🅧📲 ' + config.pixKey + '*\n';
    t += '                          _' + config.pixNome + '_\n';
    t += '*🏦  ' + config.pixBanco.toLowerCase() + '💚*\n';
    t += '*⚠️ 𝙾𝙱𝚁𝙸𝙶𝙰𝚃𝙾́𝚁𝙸𝙾 𝙲𝙾𝙼𝙿𝚁𝙾𝚅𝙰𝙽𝚃𝙴 ⚠️*\n\n';
    t += '_*🍀☺️BOA SORTE A TODOS ☺️🍀*_\n\n';
    t += '*🎀LISTA DE VALORES🎀*';

    return t;
}

function gerarListaValores() {
    const data = loadData();
    const banca = loadBanca();
    const valoresPorCliente = {};

    data.apostas.forEach(a => {
        if ((a.pago === true || a.pago === "true") && !a.cancelada && a.valorPago > 0) {
            if (!valoresPorCliente[a.userId]) {
                valoresPorCliente[a.userId] = { nome: a.nome, numero: a.numeroUsuario, rifa: 0, banca: 0, total: 0 };
            }
            valoresPorCliente[a.userId].rifa += (parseFloat(a.valorPago) || 0);
            valoresPorCliente[a.userId].total += (parseFloat(a.valorPago) || 0);
        }
    });

    banca.aprovados.forEach(p => {
        if ((p.pago === true || p.pago === "true") && p.valorTotal > 0) {
            if (!valoresPorCliente[p.userId]) {
                valoresPorCliente[p.userId] = { nome: p.nome, numero: p.numero, rifa: 0, banca: 0, total: 0 };
            }
            valoresPorCliente[p.userId].banca += (parseFloat(p.valorTotal) || 0);
            valoresPorCliente[p.userId].total += (parseFloat(p.valorTotal) || 0);
        }
    });

    return valoresPorCliente;
}

// ========== HANDLERS DE APOSTAS ==========

async function processarOfertaFechamento(msg, ofertaInfo, userId, userName, data, rifaInfo, chat) {
    const esgotamento = verificarEsgotamento(data);
    let quantidade = ofertaInfo.quantidade;
    if (!quantidade) quantidade = esgotamento.disponiveis;

    const bichosDisponiveis = [];
    Object.keys(BICHOS).forEach(codigo => {
        const info = data[codigo];
        if (info && info.cotasDisponiveis > 0) {
            bichosDisponiveis.push({ codigo, nome: BICHOS[codigo].nome, emoji: BICHOS[codigo].emoji, cotas: info.cotasDisponiveis });
        }
    });

    if (bichosDisponiveis.length === 0) return msg.reply('🔒 *RIFA JÁ ESTÁ FECHADA!*\n\nTodos os bichos já foram vendidos.');

    const valorPorBicho = config.precoPorCota;
    const valorTotal = bichosDisponiveis.reduce((acc, b) => acc + (b.cotas * valorPorBicho), 0);
    const premioTotal = bichosDisponiveis.reduce((acc, b) => acc + (b.cotas * config.premiacaoPorCota), 0);

    let resposta = '💰 *OFERTA DE FECHAMENTO* 💰\n\n';
    resposta += '👤 Admin: ' + userName + '\n';
    resposta += '📊 Bichos disponíveis: ' + bichosDisponiveis.length + '/25\n\n';
    resposta += '*BICHOS RESTANTES:*\n';
    bichosDisponiveis.forEach(b => { resposta += b.emoji + ' ' + b.nome + ' (' + b.cotas + 'x)\n'; });
    resposta += '\n💵 *Valor para fechar:* R$ ' + valorTotal.toFixed(2) + '\n';
    resposta += '🏆 *Prêmio potencial:* R$ ' + premioTotal.toFixed(2) + '\n\n';
    resposta += '*Quem quer fechar a rifa?* 🤑\n';
    resposta += 'Digite *EU* ou *FECHO* para pegar todos!';

    return msg.reply(resposta);
}

async function processarApostaRifa(msg, apostas, userId, userNumber, userName, data, rifaInfo, chat, isPrivate = false) {
    if (isPrivate) {
        return msg.reply(
            '⚠️ *RIFA SÓ NO GRUPO!*\n\n' +
            'Os pedidos para rifa devem ser feitos no grupo.\n\n' +
            '💡 No privado você pode usar:\n' +
            '• *banca* - Para apostar na banca\n' +
            '• *dezena* - Para apostar em dezenas\n' +
            '• *meus* - Ver suas apostas\n' +
            '• *ok* - Confirmar pagamento'
        );
    }

    data = loadData();

    if (data.status === 'fechada') {
        await msg.react('🏦');
        let redirecionamento = '🔒 *RIFA FECHADA!* 🔒\n\n';
        redirecionamento += 'Todos os bichos foram vendidos.\n\n';
        redirecionamento += '💡 *Use a BANCA:*\n';
        redirecionamento += 'banca ' + apostas.map(a => a.nome.toLowerCase() + ' ' + a.quantidade).join(' ') + '\n\n';
        redirecionamento += '💰 R$ 0,25 → R$ 5,00\n';
        redirecionamento += 'Funciona 24 horas!';
        return msg.reply(redirecionamento);
    }

    const proc = [], sobra = [], ajust = [];
    let totCotasRifa = 0, totValRifa = 0;
    let totCotasBanca = 0, totValBanca = 0;

    for (let ap of apostas) {
        const { bicho, quantidade } = ap;
        const gd = data[bicho];
        const bi = BICHOS[bicho];
        if (!gd) continue;
        const disp = gd.cotasDisponiveis;

        if (disp === 0) {
            sobra.push({ bicho, nome: bi.nome, emoji: bi.emoji, quantidade });
            totCotasBanca += quantidade;
            totValBanca += quantidade * 1;
        } else if (quantidade > disp) {
            const qtdRifa = disp, qtdBanca = quantidade - disp;
            const na = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                userId, numeroUsuario: userNumber, nome: userName, bicho,
                cotas: qtdRifa, valorPago: qtdRifa * config.precoPorCota,
                premiacaoPotencial: qtdRifa * config.premiacaoPorCota,
                pago: false, data: new Date().toISOString(), dataSorteio: rifaInfo.horario
            };
            data.apostas.push(na);
            gd.cotasDisponiveis = 0;
            gd.cotasVendidas += qtdRifa;
            proc.push({ aposta: na, bichoInfo: bi, tipo: 'rifa' });
            totCotasRifa += qtdRifa;
            totValRifa += qtdRifa * config.precoPorCota;
            sobra.push({ bicho, nome: bi.nome, emoji: bi.emoji, quantidade: qtdBanca });
            totCotasBanca += qtdBanca;
            totValBanca += qtdBanca * 1;
            ajust.push({ bicho: bi.nome, naRifa: qtdRifa, naBanca: qtdBanca, solicitado: quantidade });
        } else {
            const na = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                userId, numeroUsuario: userNumber, nome: userName, bicho,
                cotas: quantidade, valorPago: quantidade * config.precoPorCota,
                premiacaoPotencial: quantidade * config.premiacaoPorCota,
                pago: false, data: new Date().toISOString(), dataSorteio: rifaInfo.horario
            };
            data.apostas.push(na);
            gd.cotasDisponiveis -= quantidade;
            gd.cotasVendidas += quantidade;
            proc.push({ aposta: na, bichoInfo: bi, tipo: 'rifa' });
            totCotasRifa += quantidade;
            totValRifa += quantidade * config.precoPorCota;
        }
    }

    if (proc.length === 0 && sobra.length === 0) {
        await msg.react('❌');
        return msg.reply('Não foi possível registrar. Verifique disponibilidade.');
    }

    saveData(data);

    const esgotamento = verificarEsgotamento(data);
    if (esgotamento.esgotou && data.status !== 'fechada') await fecharRifaAutomaticamente(chat, data);

    if (sobra.length > 0) {
        const banca = loadBanca();
        const idB = gerarIdBanca(banca);
        let itensB = [];
        sobra.forEach(s => {
            const v = s.quantidade * config.precoPorCota, p = s.quantidade * config.premiacaoBanca;
            itensB.push({ tipo: 'bicho', bicho: s.bicho, nome: s.nome, cotas: s.quantidade, valor: v, premio: p });
        });
        const pedB = {
            id: idB, tipo: 'banca', userId, nome: userName, numero: userNumber,
            itens: itensB, valorTotal: totValBanca, premioTotal: (totValBanca / config.precoPorCota) * config.premiacaoBanca,
            status: 'pendente', dataSolicitacao: new Date().toISOString(),
            horarioSorteio: rifaInfo.horario, dataSorteio: rifaInfo.data, origem: 'sobra'
        };
        banca.pendentes.push(pedB);
        saveBanca(banca);
        await notificarAdminSobra(pedB, proc);
    }

    let reacao = '✅';
    if (ajust.length > 0) reacao = '⚠️';
    else if (proc.length === 0 && sobra.length > 0) reacao = '🏦';
    await msg.react(reacao);

    let resp = '';
    if (proc.length > 0) {
        const totalGeralCliente = totValRifa + (sobra.length > 0 ? totValBanca : 0);
        resp += '✅ *APOSTA REGISTRADA!*\n\n';
        proc.forEach(({ aposta, bichoInfo }) => { resp += bichoInfo.emoji + ' ' + bichoInfo.nome + ' ' + aposta.cotas + 'x\n'; });
        if (sobra.length > 0) {
            resp += '\n🏦 *SOBRA → BANCA*\n';
            sobra.forEach(s => { resp += s.emoji + ' ' + s.nome + ' ' + s.quantidade + 'x\n'; });
        }
        resp += '\n💰 *Total a pagar: R$ ' + totalGeralCliente.toFixed(2) + '*\n';
        resp += '💳 PIX: *' + config.pixKey + '*\n';
    }
    if (sobra.length > 0 && proc.length === 0) {
        // Só banca, sem rifa
        resp += '🏦 *BANCA REGISTRADA!*\n\n';
        sobra.forEach(s => { resp += s.emoji + ' ' + s.nome + ' ' + s.quantidade + 'x\n'; });
        resp += '\n💰 *Total a pagar: R$ ' + totValBanca.toFixed(2) + '*\n';
        resp += '💳 PIX: *' + config.pixKey + '*\n';
    }

    await msg.reply(resp);

    const agora = Date.now();
    if (agora - ultimaAtualizacao >= DELAY_ATUALIZACAO && !filaAtualizacao) {
        filaAtualizacao = true;
        ultimaAtualizacao = agora;
        setTimeout(async () => {
            const dataAtualizada = loadData();
            if (dataAtualizada.status !== 'fechada') await chat.sendMessage(gerarDisponiveis(dataAtualizada, rifaInfo));
            filaAtualizacao = false;
        }, 1000);
    } else {
        logger.info('⏳ Atualização de lista adiada (delay de 45 segundos)');
    }
}

async function notificarAdminSobra(pedB, proc) {
    if (config.admins.length === 0) return;
    let t = '📢 *SOBRA AUTOMÁTICA - BANCA* #' + pedB.id + '\n\n';
    t += '👤 Usuário: ' + pedB.nome + '\n';
    t += '📱 Número: @' + pedB.numero + '\n';
    t += '🕐 Horário: ' + pedB.horarioSorteio + '\n\n';
    if (proc.length > 0) {
        t += '✅ *NA RIFA:*\n';
        proc.forEach(({ aposta, bichoInfo }) => { t += bichoInfo.emoji + ' ' + bichoInfo.nome + ' ' + aposta.cotas + 'x\n'; });
        t += '\n';
    }
    t += '🏦 *NA BANCA (SOBRA):*\n';
    pedB.itens.forEach(i => { t += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x = R$ ' + i.valor.toFixed(2) + '\n'; });
    t += '\n💵 *Total Banca:* R$ ' + pedB.valorTotal.toFixed(2) + '\n';
    t += '🏆 *Prêmio:* R$ ' + pedB.premioTotal.toFixed(2) + '\n\n';
    t += '✅ *aprovar* ' + pedB.id + '\n';
    t += '❌ *recusar* ' + pedB.id;
    for (const adm of config.admins) {
        try { const c = await client.getChatById(adm); await c.sendMessage(t, { mentions: [pedB.userId] }); } catch (e) {}
    }
}

async function cancelarAposta(msg, args, userId, admin) {
    const data = loadData();
    logger.info(`🔍 CANCELAR v16 - userId: ${userId}, args: ${JSON.stringify(args)}, apostas: ${data.apostas.length}`);

    // ============================================================
    // FIX v16.0: "cancelar todos" - matchUserId robusto
    // ============================================================
    if (args.length >= 1 && (args[0].toLowerCase() === 'todos' || args[0].toLowerCase() === 'todas')) {
        const minhas = data.apostas.filter(a => !a.cancelada && matchUserId(a.userId, a.numeroUsuario, userId));
        logger.info(`🔍 CANCELAR TODOS - encontradas: ${minhas.length}`);

        if (minhas.length === 0) {
            const jaCancel = data.apostas.filter(a => a.cancelada && matchUserId(a.userId, a.numeroUsuario, userId));
            let r = '📭 Você não tem apostas para cancelar.';
            if (jaCancel.length > 0) r += `\n\n⚠️ Você tem ${jaCancel.length} aposta(s) já cancelada(s).`;
            r += '\n\n💡 Digite *meus* para ver suas apostas.';
            return msg.reply(r);
        }

        let totalCancelado = 0;
        const bichosCancelados = [];
        for (let i = 0; i < data.apostas.length; i++) {
            const a = data.apostas[i];
            if (!a.cancelada && matchUserId(a.userId, a.numeroUsuario, userId)) {
                const gd = data[a.bicho];
                if (gd) { gd.cotasDisponiveis += a.cotas; gd.cotasVendidas = Math.max(0, (gd.cotasVendidas||0) - a.cotas); }
                a.cancelada = true;
                a.dataCancelamento = new Date().toISOString();
                a.canceladoPor = userId;
                a.metodoCancelamento = 'cancelar-todos-v16';
                totalCancelado += (parseFloat(a.valorPago) || 0);
                bichosCancelados.push(BICHOS[a.bicho].emoji + ' ' + BICHOS[a.bicho].nome + ' ' + a.cotas + 'x');
            }
        }
        saveData(data);

        // Cancela banca pendente também
        const banca = loadBanca();
        const bancasPend = banca.pendentes.filter(p => matchUserId(p.userId, p.numero, userId));
        let bancasCanceladas = 0, totalBanca = 0;
        if (bancasPend.length > 0) {
            bancasPend.forEach(p => { bancasCanceladas++; totalBanca += (parseFloat(p.valorTotal)||0); });
            banca.pendentes = banca.pendentes.filter(p => !matchUserId(p.userId, p.numero, userId));
            saveBanca(banca);
            atualizarCachePendentes(banca.pendentes);
        }

        let t = '✅ *TODAS AS APOSTAS CANCELADAS!*\n\n';
        t += '📊 Rifa: ' + minhas.length + ' aposta(s) — R$ ' + totalCancelado.toFixed(2) + '\n';
        if (bancasCanceladas > 0) t += '🏦 Banca: ' + bancasCanceladas + ' pedido(s) — R$ ' + totalBanca.toFixed(2) + '\n';
        t += '\n📝 *Bichos cancelados:*\n';
        bichosCancelados.forEach(b => { t += '• ' + b + '\n'; });
        t += '\n🔄 Cotas devolvidas ao estoque!';
        return msg.reply(t);
    }

    // Admin via resposta à mensagem do cliente
    if (admin && msg.hasQuotedMsg && args.length === 0) {
        try {
            const quotedMsg = await msg.getQuotedMessage();
            const targetId = quotedMsg.author || quotedMsg.from;
            const apostasDoUsuario = data.apostas.filter(a => matchUserId(a.userId, a.numeroUsuario, targetId) && !a.cancelada);
            if (apostasDoUsuario.length === 0) return msg.reply('⚠️ O usuário citado não tem apostas para cancelar.');
            const ap = apostasDoUsuario[apostasDoUsuario.length - 1];
            const gd = data[ap.bicho];
            if (gd) { gd.cotasDisponiveis += ap.cotas; gd.cotasVendidas = Math.max(0, (gd.cotasVendidas||0) - ap.cotas); }
            ap.cancelada = true; ap.dataCancelamento = new Date().toISOString(); ap.canceladoPor = userId; ap.metodoCancelamento = 'resposta';
            saveData(data);
            const bi = BICHOS[ap.bicho];
            return msg.reply('✅ *CANCELADO VIA RESPOSTA*\n\n👤 ' + ap.nome + '\n' + bi.emoji + ' ' + bi.nome + ' ' + ap.cotas + 'x\n💰 R$ ' + ap.valorPago.toFixed(2) + '\n\n🔄 Cotas devolvidas!');
        } catch (e) { logger.error('Erro cancelar via resposta:', e); return msg.reply('❌ Erro ao cancelar. Tente: cancelar [ID]'); }
    }

    // Sem args: lista apostas
    if (args.length === 0) {
        const minhas = data.apostas.filter(a => matchUserId(a.userId, a.numeroUsuario, userId) && !a.cancelada);
        if (minhas.length === 0) {
            const jaCancel = data.apostas.filter(a => matchUserId(a.userId, a.numeroUsuario, userId) && a.cancelada);
            let r = '📭 Você não tem apostas para cancelar.';
            if (jaCancel.length > 0) r += `\n\n⚠️ ${jaCancel.length} aposta(s) já cancelada(s).`;
            return msg.reply(r + '\n\n💡 Digite *meus* para ver suas apostas.');
        }
        let t = '📋 *SUAS APOSTAS*\n\n';
        minhas.slice(-5).forEach((a, i) => {
            t += (i+1) + '. ' + BICHOS[a.bicho].emoji + ' ' + BICHOS[a.bicho].nome + ' ' + a.cotas + 'x\n';
            t += '   💰 R$ ' + a.valorPago.toFixed(2) + ((a.pago===true||a.pago==='true') ? ' ✅ (Pago)' : ' ⏳ (Pendente)');
            t += '\n   🆔 `' + a.id.substring(0,8) + '...`\n\n';
        });
        t += '• `cancelar todos` — cancela tudo\n• `cancelar elefante` — cancela por bicho\n• `cancelar [ID]` — cancela específico';
        if (admin) t += '\n• `cancelar @numero [ID]` — admin';
        return msg.reply(t);
    }

    // Cancelar por nome do bicho
    const nomeBichoArg = (args[0]||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const codigoBichoCancel = NOME_PARA_CODIGO[nomeBichoArg] || NOME_PARA_CODIGO[nomeBichoArg.replace(/s$/,'')];
    if (codigoBichoCancel) {
        const apostasBicho = data.apostas.filter(a => matchUserId(a.userId, a.numeroUsuario, userId) && a.bicho === codigoBichoCancel && !a.cancelada);
        if (apostasBicho.length === 0) return msg.reply('❌ Você não tem apostas de ' + BICHOS[codigoBichoCancel].nome + ' para cancelar.');
        let totalCancelado = 0;
        for (let i = 0; i < data.apostas.length; i++) {
            const a = data.apostas[i];
            if (matchUserId(a.userId, a.numeroUsuario, userId) && a.bicho === codigoBichoCancel && !a.cancelada) {
                const gd = data[a.bicho];
                if (gd) { gd.cotasDisponiveis += a.cotas; gd.cotasVendidas = Math.max(0, (gd.cotasVendidas||0) - a.cotas); }
                a.cancelada = true; a.dataCancelamento = new Date().toISOString(); a.canceladoPor = userId; a.metodoCancelamento = 'cancelar-bicho';
                totalCancelado += (parseFloat(a.valorPago)||0);
            }
        }
        saveData(data);
        const bi = BICHOS[codigoBichoCancel];
        const totalCotas = apostasBicho.reduce((s,a) => s+a.cotas, 0);
        return msg.reply('✅ *CANCELADO!*\n\n' + bi.emoji + ' ' + bi.nome + ' ' + totalCotas + 'x\n💰 R$ ' + totalCancelado.toFixed(2) + '\n\n🔄 Cotas devolvidas ao estoque!');
    }

    // Admin cancela por número: cancelar 71999999999 ID
    let target = userId, apostaId = args[0];
    if (admin && args.length >= 2) {
        const n = args[0].replace(/[^\d]/g,'');
        if (n.length >= 10) { target = n + '@c.us'; apostaId = args[1]; }
    }

    // Cancelar por ID
    const ap = data.apostas.find(a =>
        (a.id === apostaId || a.id.startsWith(apostaId)) &&
        matchUserId(a.userId, a.numeroUsuario, target) && !a.cancelada
    );
    if (!ap) return msg.reply('❌ Aposta não encontrada. Use `cancelar` para listar suas apostas.');
    const gd = data[ap.bicho];
    if (gd) { gd.cotasDisponiveis += ap.cotas; gd.cotasVendidas = Math.max(0, (gd.cotasVendidas||0) - ap.cotas); }
    ap.cancelada = true; ap.dataCancelamento = new Date().toISOString(); ap.canceladoPor = userId;
    saveData(data);
    const bi = BICHOS[ap.bicho];
    return msg.reply('✅ *APOSTA CANCELADA*\n\n' + bi.emoji + ' ' + bi.nome + ' ' + ap.cotas + 'x\n💰 R$ ' + ap.valorPago.toFixed(2) + '\n\n🔄 Cotas devolvidas ao estoque!');
}

// ========== CANCELAR BANCA (v14.0 - FIX: funciona ao responder aposta manual) ==========

/**
 * cancelarBanca - v14.0
 *
 * FIX PRINCIPAL: Quando o admin responde uma mensagem de "APOSTA MANUAL REGISTRADA"
 * (que foi enviada pelo próprio bot/admin), o bot agora busca o cliente correto
 * pesquisando pela banca mais recente registrada para o usuário alvo, ao invés
 * de usar o autor da mensagem citada (que seria o admin).
 *
 * Formas de uso:
 *   - Responde msg "APOSTA MANUAL REGISTRADA" + "cancelarbanca"           → cancela TODOS os pedidos do cliente registrado
 *   - Responde msg "APOSTA MANUAL REGISTRADA" + "cancelarbanca elefante"  → remove elefante do cliente
 *   - Responde msg do cliente + "cancelarbanca"                           → cancela TODOS os pedidos de banca do cliente
 *   - Responde msg do cliente + "cancelarbanca elefante"                  → remove elefante dos pedidos do cliente
 *   - cancelarbanca B1001                                                 → cancela pedido inteiro pelo ID
 *   - cancelarbanca elefante                                              → remove elefante dos próprios pedidos
 *   - cancelarbanca todos                                                 → cancela todos os próprios pedidos pendentes
 */
async function cancelarBanca(msg, args, userId, admin) {
    const banca = loadBanca();

    // Determina usuário alvo
    let targetId = userId;
    let viaResposta = false;

    if (admin && msg.hasQuotedMsg) {
        try {
            const q = await msg.getQuotedMessage();
            const authorId = q.author || q.from;
            const bodyQuoted = (q.body || '').trim();

            // *** FIX v14.0 ***
            // Se a mensagem citada é uma "APOSTA MANUAL REGISTRADA" (enviada pelo bot/admin),
            // procuramos o cliente pela banca mais recente registrada,
            // buscando no texto da mensagem o número do cliente.
            const ehApostaManual = bodyQuoted.includes('APOSTA MANUAL REGISTRADA') ||
                                   bodyQuoted.includes('NA BANCA:') ||
                                   bodyQuoted.includes('NA RIFA:');

            if (ehApostaManual) {
                // Tenta extrair número do cliente do corpo da mensagem ("📱 Número: XXXXXXXXXXX")
                const matchNumero = bodyQuoted.match(/[Nn]ú?mero[:\s]+(\d{10,15})/);
                if (matchNumero) {
                    const numeroCliente = matchNumero[1];
                    // Tenta encontrar o userId nas bancas registradas
                    const todasBancas = [...banca.pendentes, ...banca.aprovados];
                    const bancaCliente = todasBancas.find(p =>
                        p.numero === numeroCliente ||
                        (p.userId && p.userId.includes(numeroCliente))
                    );
                    if (bancaCliente) {
                        targetId = bancaCliente.userId;
                        viaResposta = true;
                        logger.info(`[cancelarBanca] FIX: cliente detectado via aposta manual: ${targetId}`);
                    } else {
                        // Fallback: monta userId a partir do número
                        targetId = numeroCliente + '@c.us';
                        viaResposta = true;
                        logger.info(`[cancelarBanca] FIX fallback: usando número direto: ${targetId}`);
                    }
                } else {
                    // A mensagem é do bot mas sem número explícito — tenta usar o ID da banca mais recente
                    // Busca ID de banca no texto: "#B1001"
                    const matchIdBanca = bodyQuoted.match(/#(B\d+)/);
                    if (matchIdBanca) {
                        const idBanca = matchIdBanca[1];
                        const pedBanca = [...banca.pendentes, ...banca.aprovados].find(p => p.id === idBanca);
                        if (pedBanca) {
                            targetId = pedBanca.userId;
                            viaResposta = true;
                            logger.info(`[cancelarBanca] FIX via ID banca #${idBanca}: ${targetId}`);
                        } else {
                            // Último fallback: usa o autor da mensagem citada
                            targetId = authorId;
                            viaResposta = true;
                        }
                    } else {
                        targetId = authorId;
                        viaResposta = true;
                    }
                }
            } else {
                // Mensagem normal do cliente → usa o autor normalmente
                targetId = authorId;
                viaResposta = true;
            }
        } catch (e) {
            logger.error('[cancelarBanca] Erro ao processar mensagem citada:', e);
        }
    }

    const targetNumber = targetId.split('@')[0];

    // ---- SEM ARGS ou "todos": cancela TODOS os pedidos do alvo ----
    if (args.length === 0 || (args.length === 1 && args[0].toLowerCase() === 'todos')) {
        const pends = banca.pendentes.filter(p => p.userId === targetId);
        const aprovs = banca.aprovados.filter(p => p.userId === targetId);

        // Tenta também pela variação @lid vs @c.us
        const targetIdAlt = targetId.endsWith('@c.us')
            ? targetId.replace('@c.us', '@lid')
            : targetId.replace('@lid', '@c.us');
        const pendsAlt = banca.pendentes.filter(p => p.userId === targetIdAlt);
        const aprovsAlt = banca.aprovados.filter(p => p.userId === targetIdAlt);

        const todosPends = [...pends, ...pendsAlt];
        const todosAprovs = [...aprovs, ...aprovsAlt];

        if (todosPends.length === 0 && todosAprovs.length === 0) {
            return msg.reply('📭 ' + (viaResposta ? 'Este cliente' : 'Você') + ' não tem pedidos de banca para cancelar.\n\n🆔 Número buscado: ' + targetNumber);
        }
        let cancelados = [], valorTotal = 0;
        [...todosPends, ...todosAprovs].forEach(p => { cancelados.push('#' + p.id); valorTotal += p.valorTotal; });
        banca.pendentes = banca.pendentes.filter(p => p.userId !== targetId && p.userId !== targetIdAlt);
        banca.aprovados = banca.aprovados.filter(p => p.userId !== targetId && p.userId !== targetIdAlt);
        saveBanca(banca);
        atualizarCachePendentes(banca.pendentes);
        try {
            const notifId = [...todosPends, ...todosAprovs][0]?.userId || targetId;
            const c = await client.getChatById(notifId);
            await c.sendMessage('❌ *BANCA CANCELADA*\n\n' + cancelados.join(', ') + '\n💰 Total: R$ ' + valorTotal.toFixed(2) + '\n\nContate o admin para mais informações.');
        } catch (e) {}
        let r = '✅ *BANCA CANCELADA (TODOS)*\n\n';
        r += '👤 Número: ' + targetNumber + '\n';
        r += '📊 Pedidos: ' + cancelados.length + '\n';
        r += '💰 Valor: R$ ' + valorTotal.toFixed(2) + '\n\n';
        cancelados.forEach(id => { r += '• ' + id + '\n'; });
        r += '\n📩 Cliente notificado.';
        return msg.reply(r);
    }

    // ---- ID direto: cancelarbanca B1001 ----
    const primeiroArg = args[0].toUpperCase();
    if (/^B\d+$/.test(primeiroArg)) {
        const idxP = banca.pendentes.findIndex(p => p.id === primeiroArg);
        const idxA = banca.aprovados.findIndex(p => p.id === primeiroArg);
        if (idxP !== -1) {
            const ped = banca.pendentes[idxP];
            banca.pendentes.splice(idxP, 1);
            saveBanca(banca); atualizarCachePendentes(banca.pendentes);
            try { const c = await client.getChatById(ped.userId); await c.sendMessage('❌ *BANCA CANCELADA*\n\n🆔 #' + ped.id + '\nR$ ' + ped.valorTotal.toFixed(2)); } catch (e) {}
            return msg.reply('✅ Pedido #' + ped.id + ' cancelado! (R$ ' + ped.valorTotal.toFixed(2) + ')');
        }
        if (idxA !== -1) {
            const ped = banca.aprovados[idxA];
            banca.aprovados.splice(idxA, 1);
            saveBanca(banca);
            try { const c = await client.getChatById(ped.userId); await c.sendMessage('❌ *BANCA CANCELADA*\n\n🆔 #' + ped.id + '\nR$ ' + ped.valorTotal.toFixed(2)); } catch (e) {}
            return msg.reply('✅ Pedido #' + ped.id + ' cancelado! (R$ ' + ped.valorTotal.toFixed(2) + ')');
        }
        return msg.reply('❌ Pedido ' + primeiroArg + ' não encontrado.');
    }

    // ---- Por nome de bicho: cancelarbanca elefante [qtd] ----
    const textoArgs = args.join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, '').trim();
    let nomeBicho = textoArgs;
    let qtdRemover = null;

    const matchQtd = textoArgs.match(/^(.+?)\s+(\d+)$/);
    if (matchQtd) {
        nomeBicho = matchQtd[1].trim();
        qtdRemover = parseInt(matchQtd[2]);
    }

    let nomeLookup = nomeBicho;
    if (nomeLookup.endsWith('s') && !NOME_PARA_CODIGO[nomeLookup]) nomeLookup = nomeLookup.slice(0, -1);
    const codBicho = NOME_PARA_CODIGO[nomeLookup];

    if (!codBicho) {
        return msg.reply(
            '❌ Bicho *"' + args[0] + '"* não reconhecido.\n\n' +
            '*Como usar:*\n' +
            '• `cancelarbanca elefante` → remove elefante de todos os pedidos\n' +
            '• `cancelarbanca elefante 5` → remove 5 cotas de elefante\n' +
            '• `cancelarbanca B1001` → cancela pedido pelo ID\n' +
            '• Ou responda a msg do cliente + `cancelarbanca elefante`'
        );
    }

    const bichoInfo = BICHOS[codBicho];
    let totalCotas = 0, totalValor = 0, alterados = 0;

    // Suporte a @lid e @c.us
    const targetIdAlt = targetId.endsWith('@c.us')
        ? targetId.replace('@c.us', '@lid')
        : targetId.replace('@lid', '@c.us');

    function processarLista(lista) {
        const novaLista = [];
        for (const ped of lista) {
            const matchesTarget = ped.userId === targetId || ped.userId === targetIdAlt;
            if (!matchesTarget || ped.tipo !== 'banca') { novaLista.push(ped); continue; }
            const idxItem = ped.itens.findIndex(it => it.bicho === codBicho);
            if (idxItem === -1) { novaLista.push(ped); continue; }
            const item = ped.itens[idxItem];
            const cotas = qtdRemover ? Math.min(qtdRemover, item.cotas) : item.cotas;
            const valor = cotas * 1;
            totalCotas += cotas;
            totalValor += valor;
            alterados++;
            if (cotas >= item.cotas) {
                ped.itens.splice(idxItem, 1);
                ped.valorTotal = Math.max(0, ped.valorTotal - valor);
                ped.premioTotal = Math.max(0, ped.premioTotal - cotas * config.premiacaoBanca);
                if (ped.itens.length > 0) novaLista.push(ped);
            } else {
                item.cotas -= cotas;
                item.valor = item.cotas * 1;
                item.premio = item.cotas * config.premiacaoBanca;
                ped.valorTotal = Math.max(0, ped.valorTotal - valor);
                ped.premioTotal = Math.max(0, ped.premioTotal - cotas * config.premiacaoBanca);
                novaLista.push(ped);
            }
        }
        return novaLista;
    }

    banca.pendentes = processarLista(banca.pendentes);
    banca.aprovados = processarLista(banca.aprovados);

    if (alterados === 0) {
        return msg.reply('📭 ' + (viaResposta ? 'Este cliente' : 'Você') + ' não tem *' + bichoInfo.nome + '* na banca.\n\n🆔 Número buscado: ' + targetNumber);
    }

    saveBanca(banca);
    atualizarCachePendentes(banca.pendentes);

    try {
        const notifId = targetId;
        const c = await client.getChatById(notifId);
        await c.sendMessage('❌ *BANCA ATUALIZADA*\n\n' + bichoInfo.emoji + ' *' + bichoInfo.nome + '* removido(a)\n' +
            (qtdRemover ? qtdRemover + ' cotas' : 'Todas as cotas') + ' canceladas\n💰 R$ ' + totalValor.toFixed(2) + ' removido');
    } catch (e) {}

    return msg.reply('✅ *BANCA CANCELADA*\n\n' + bichoInfo.emoji + ' *' + bichoInfo.nome + '* ' + totalCotas + 'x removido(a)\n👤 ' + targetNumber + '\n💰 R$ ' + totalValor.toFixed(2) + '\n📩 Cliente notificado.');
}

// ========== NOVO v16.0: ADICIONAR BICHOS AO ESTOQUE ==========
/**
 * adicionarEstoque - ADMIN ONLY
 * Restaura cotas ao estoque da rifa (cotasDisponiveis).
 * Use para corrigir quando cancelamentos não restauraram o estoque.
 * NÃO cria apostas para clientes — use !colocar para isso.
 *
 * Uso: !adicionar elefante 2 vaca 1 burro 3
 *      !adicionar elefante 2, vaca 1, cobra 1
 */
async function adicionarEstoque(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode usar esse comando!');

    if (args.length === 0) {
        return msg.reply(
            '🔧 *ADICIONAR AO ESTOQUE DA RIFA*\n\n' +
            'Restaura cotas disponíveis sem criar apostas de clientes.\n\n' +
            '*Uso:*\n' +
            '• `adicionar elefante 2 vaca 1`\n' +
            '• `adicionar elefante 2, vaca 1, burro 3`\n\n' +
            '💡 _Para adicionar aposta de cliente, use_ `colocar`'
        );
    }

    const textoNorm = args.join(' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    // Usa extrairApostasFlexivel mas passando o texto sem bloqueios de pergunta
    const apostas = [];
    const limpo = textoNorm.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();
    const p1 = /(\d+)\s*x?\s+([a-z]+)/g, p2 = /([a-z]+)\s+(\d+)\s*x?/g;
    let mm;
    const processadas = new Set();
    while ((mm = p1.exec(limpo)) !== null) {
        const q = parseInt(mm[1]), n = mm[2].trim(), nS = n.endsWith('s')?n.slice(0,-1):n;
        const b = NOME_PARA_CODIGO[n]||NOME_PARA_CODIGO[nS];
        if (b && q>=1 && q<=100 && !processadas.has(b)) { apostas.push({bicho:b,quantidade:q,nome:BICHOS[b].nome}); processadas.add(b); }
    }
    while ((mm = p2.exec(limpo)) !== null) {
        const n = mm[1].trim(), nS = n.endsWith('s')?n.slice(0,-1):n, q = parseInt(mm[2]);
        const b = NOME_PARA_CODIGO[n]||NOME_PARA_CODIGO[nS];
        if (b && q>=1 && q<=100 && !processadas.has(b)) { apostas.push({bicho:b,quantidade:q,nome:BICHOS[b].nome}); processadas.add(b); }
    }

    if (apostas.length === 0) {
        return msg.reply('❌ Não entendi os bichos.\n\nExemplo: `adicionar elefante 2 vaca 1`\n\n💡 Sempre inclua nome + quantidade!');
    }

    const data = loadData();
    const adicionados = [], avisos = [];

    for (const ap of apostas) {
        const { bicho, quantidade } = ap;
        const gd = data[bicho];
        const bi = BICHOS[bicho];
        if (!gd) { avisos.push('❌ ' + ap.nome + ': inválido'); continue; }
        const maxCotas = config.cotasPorBicho;
        const qtdReal = Math.min(quantidade, maxCotas - gd.cotasDisponiveis);
        if (qtdReal <= 0) { avisos.push('⚠️ ' + bi.nome + ': já está no máximo (' + maxCotas + ')'); continue; }
        gd.cotasDisponiveis += qtdReal;
        adicionados.push({ bi, qtdReal, disponivelAgora: gd.cotasDisponiveis });
    }

    if (adicionados.length === 0) {
        return msg.reply('❌ Nenhum bicho adicionado.\n\n' + avisos.join('\n'));
    }

    saveData(data);

    let r = '✅ *ESTOQUE RESTAURADO!*\n\n📦 *Cotas adicionadas:*\n';
    adicionados.forEach(({ bi, qtdReal, disponivelAgora }) => {
        r += bi.emoji + ' ' + bi.nome + ' +' + qtdReal + 'x → disponível: ' + disponivelAgora + '\n';
    });
    if (avisos.length > 0) r += '\n' + avisos.join('\n');
    r += '\n\n💡 _Estoque ajustado sem criar apostas de clientes._';
    await msg.reply(r);

    const rifaInfo = verificarRifaAutomatica();
    if (data.status !== 'fechada') {
        setTimeout(async () => { try { await chat.sendMessage(gerarDisponiveis(loadData(), rifaInfo)); } catch(e){} }, 1000);
    }
}

// ========== NOVO v17.0: !remover — remove bichos específicos do pedido ==========
/**
 * Admin responde a mensagem do cliente e escreve:
 *   !remover 1 elefante, 2 aguia, 1 touro
 *
 * Isso remove esses bichos do pedido do cliente e devolve as cotas ao estoque.
 * NÃO cancela o pedido inteiro — só remove os bichos especificados.
 * Funciona mesmo que o cancelar não esteja funcionando.
 */
async function removerBichosCliente(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode usar esse comando!');

    if (args.length === 0) {
        return msg.reply(
            '🔧 *REMOVER BICHOS DO PEDIDO*\n\n' +
            'Responda a mensagem do cliente e escreva:\n' +
            '`!remover 1 elefante 2 aguia 1 touro`\n\n' +
            '• Remove só os bichos informados\n' +
            '• Devolve cotas ao estoque\n' +
            '• NÃO cancela o pedido inteiro\n\n' +
            '💡 Para cancelar tudo: responda e escreva `cancelar`'
        );
    }

    // Obtém o targetId: via resposta (quoted msg) ou via número no arg
    let targetId = null;
    let targetNome = null;

    if (msg.hasQuotedMsg) {
        try {
            const quoted = await msg.getQuotedMessage();
            targetId = quoted.author || quoted.from;
        } catch (e) {}
    }

    // Se primeiro arg for número, usa como target
    if (!targetId && args.length >= 1 && /^\d{8,}$/.test(args[0].replace(/\D/g,''))) {
        const n = args[0].replace(/\D/g,'');
        targetId = n + '@c.us';
        args = args.slice(1);
    }

    if (!targetId) {
        return msg.reply('❌ Responda a mensagem do cliente e escreva:\n`!remover 1 elefante 2 aguia`\n\nOu informe o número:\n`!remover 71999999999 elefante 2 aguia 1`');
    }

    // Extrai os bichos a remover dos args
    const textoArgs = args.join(' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
    const limpo = textoArgs.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\w\s]/g,' ').replace(/\s+/g,' ').trim();

    const paraRemover = []; // [{bicho, quantidade}]
    const proc = new Set();
    // Padrão: "N bicho" ou "bicho N"
    let mm;
    const r1 = /(\d+)\s*x?\s+([a-z]+)/g;
    while ((mm = r1.exec(limpo)) !== null) {
        const q = parseInt(mm[1]), n = mm[2], nS = n.endsWith('s')?n.slice(0,-1):n;
        const b = NOME_PARA_CODIGO[n]||NOME_PARA_CODIGO[nS];
        if (b && q>=1 && !proc.has(b)) { paraRemover.push({bicho:b, quantidade:q}); proc.add(b); }
    }
    const r2 = /([a-z]+)\s+(\d+)\s*x?/g;
    while ((mm = r2.exec(limpo)) !== null) {
        const n = mm[1], nS = n.endsWith('s')?n.slice(0,-1):n, q = parseInt(mm[2]);
        const b = NOME_PARA_CODIGO[n]||NOME_PARA_CODIGO[nS];
        if (b && q>=1 && !proc.has(b)) { paraRemover.push({bicho:b, quantidade:q}); proc.add(b); }
    }
    // Só nome (sem número) → remove 1
    if (paraRemover.length === 0) {
        limpo.split(/\s+/).forEach(p => {
            const nS = p.endsWith('s')?p.slice(0,-1):p;
            const b = NOME_PARA_CODIGO[p]||NOME_PARA_CODIGO[nS];
            if (b && !proc.has(b)) { paraRemover.push({bicho:b, quantidade:1}); proc.add(b); }
        });
    }

    if (paraRemover.length === 0) {
        return msg.reply('❌ Não entendi os bichos.\n\nExemplo: `!remover 1 elefante 2 aguia`');
    }

    const data = loadData();
    const removidos = [], naoencontrados = [], avisos = [];

    for (const item of paraRemover) {
        const bi = BICHOS[item.bicho];
        // Busca apostas ativas desse usuário com esse bicho
        const apostasAlvo = data.apostas.filter(a =>
            matchUserId(a.userId, a.numeroUsuario, targetId) &&
            a.bicho === item.bicho && !a.cancelada
        );

        if (apostasAlvo.length === 0) {
            naoencontrados.push(bi.emoji + ' ' + bi.nome + ': não encontrado');
            continue;
        }

        // Remove a quantidade solicitada distribuindo pelas apostas
        let qtdRestante = item.quantidade;
        for (let i = 0; i < data.apostas.length && qtdRestante > 0; i++) {
            const a = data.apostas[i];
            if (!matchUserId(a.userId, a.numeroUsuario, targetId) || a.bicho !== item.bicho || a.cancelada) continue;

            if (a.cotas <= qtdRestante) {
                // Remove a aposta inteira
                qtdRestante -= a.cotas;
                const cotasDev = a.cotas;
                const valDev = a.valorPago || 0;
                a.cancelada = true;
                a.dataCancelamento = new Date().toISOString();
                a.canceladoPor = adminId;
                a.metodoCancelamento = 'remover-admin';
                // Devolve ao estoque
                const gd = data[item.bicho];
                if (gd) { gd.cotasDisponiveis += cotasDev; gd.cotasVendidas = Math.max(0,(gd.cotasVendidas||0)-cotasDev); }
                removidos.push({ bi, cotas: cotasDev, valor: valDev });
                if (!targetNome) targetNome = a.nome;
            } else {
                // Remove parcialmente — reduz cotas
                const cotasDev = qtdRestante;
                const proporcao = cotasDev / a.cotas;
                const valDev = (a.valorPago || 0) * proporcao;
                a.cotas -= cotasDev;
                a.valorPago = (a.valorPago || 0) - valDev;
                qtdRestante = 0;
                // Devolve ao estoque
                const gd = data[item.bicho];
                if (gd) { gd.cotasDisponiveis += cotasDev; gd.cotasVendidas = Math.max(0,(gd.cotasVendidas||0)-cotasDev); }
                removidos.push({ bi, cotas: cotasDev, valor: valDev });
                if (!targetNome) targetNome = a.nome;
            }
        }

        if (qtdRestante > 0) {
            avisos.push('⚠️ ' + bi.nome + ': só havia ' + (item.quantidade - qtdRestante) + 'x (pediu ' + item.quantidade + 'x)');
        }
    }

    if (removidos.length === 0) {
        return msg.reply('❌ Nenhum bicho encontrado para remover.\n\n' + naoencontrados.join('\n') + '\n\n💡 Use `meus` para ver as apostas do cliente.');
    }

    saveData(data);

    // Atualiza lista do grupo
    const rifaInfo = verificarRifaAutomatica();
    if (data.status !== 'fechada') {
        setTimeout(async () => { try { await chat.sendMessage(gerarDisponiveis(loadData(), rifaInfo)); } catch(e){} }, 1000);
    }

    const totalCotas = removidos.reduce((s,r) => s + r.cotas, 0);
    const totalValor = removidos.reduce((s,r) => s + r.valor, 0);
    const numTarget = targetId.split('@')[0].replace(/\D/g,'');

    let resp = '✅ *BICHOS REMOVIDOS!*\n\n';
    resp += '👤 Cliente: ' + (targetNome || numTarget) + '\n';
    resp += '📱 @' + numTarget + '\n\n';
    resp += '🗑️ *Removidos:*\n';
    removidos.forEach(r => { resp += r.bi.emoji + ' ' + r.bi.nome + ' ' + r.cotas + 'x\n'; });
    if (avisos.length > 0) resp += '\n' + avisos.join('\n') + '\n';
    if (naoencontrados.length > 0) resp += '\n' + naoencontrados.join('\n') + '\n';
    resp += '\n💰 Valor removido: R$ ' + totalValor.toFixed(2);
    resp += '\n🔄 ' + totalCotas + ' cota(s) devolvida(s) ao estoque!';

    await msg.reply(resp);

    // Notifica cliente no privado
    try {
        const clienteChat = await client.getChatById(targetId);
        let notif = '⚠️ *PEDIDO ATUALIZADO*\n\n';
        notif += '🗑️ *Bichos removidos do seu pedido:*\n';
        removidos.forEach(r => { notif += r.bi.emoji + ' ' + r.bi.nome + ' ' + r.cotas + 'x\n'; });
        notif += '\n💡 Use *meus* para ver seus pedidos atualizados.';
        await clienteChat.sendMessage(notif);
    } catch (e) { logger.error('Erro ao notificar cliente no !remover:', e.message); }
}

// ========== NOVO v17.0: !ban — banir participante do grupo ==========
/**
 * Admin usa de duas formas:
 *   1. Respondendo à mensagem do spammer: !ban
 *   2. Por número: !ban 71999999999
 *
 * Remove o participante do grupo e envia confirmação.
 */
async function banirParticipante(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode usar esse comando!');

    let targetId = null;
    let targetNumero = null;

    // Via resposta à mensagem
    if (msg.hasQuotedMsg) {
        try {
            const quoted = await msg.getQuotedMessage();
            targetId = quoted.author || quoted.from;
            targetNumero = targetId.split('@')[0];
        } catch (e) {}
    }

    // Via número nos args
    if (!targetId && args.length >= 1) {
        const n = args[0].replace(/\D/g,'');
        if (n.length >= 8) {
            targetId = n + '@c.us';
            targetNumero = n;
        }
    }

    if (!targetId) {
        return msg.reply(
            '🚫 *BANIR PARTICIPANTE*\n\n' +
            '*Como usar:*\n' +
            '• Responda a mensagem do spammer + escreva `ban`\n' +
            '• Ou: `ban 71999999999`\n\n' +
            '⚠️ O participante será removido do grupo imediatamente.'
        );
    }

    // Impede banir a si mesmo ou outros admins
    if (isAdmin(targetId)) {
        return msg.reply('⚠️ Não é possível banir um admin do bot.');
    }

    try {
        // Tenta remover pelo chat atual (deve ser o grupo)
        const groupChat = chat.isGroup ? chat : null;
        let grupoChat = groupChat;

        // Se não estiver no contexto do grupo, carrega pelo ID salvo
        if (!grupoChat || !grupoChat.isGroup) {
            const grupoConfig = loadGrupo();
            if (grupoConfig && grupoConfig.grupoId) {
                grupoChat = await client.getChatById(grupoConfig.grupoId);
            }
        }

        if (!grupoChat || !grupoChat.isGroup) {
            return msg.reply('❌ Só é possível banir dentro do grupo ou após configurar o grupo com `grupo`.');
        }

        // Remove o participante
        await grupoChat.removeParticipants([targetId]);

        logger.info(`🚫 BAN: ${targetNumero} banido por ${adminId}`);

        let r = '🚫 *PARTICIPANTE BANIDO!*\n\n';
        r += '📱 Número: ' + targetNumero + '\n';
        r += '👮 Banido por: admin\n';
        r += '🕐 ' + new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
        await msg.reply(r);

    } catch (e) {
        logger.error('Erro ao banir participante:', e.message);
        if (e.message && e.message.includes('not-authorized')) {
            return msg.reply('❌ O bot precisa ser *admin do grupo* para banir participantes!\n\nPromova o bot a admin e tente novamente.');
        }
        return msg.reply('❌ Não foi possível banir.\nVerifique se o bot é admin do grupo.\n\nErro: ' + e.message);
    }
}

// ========== NOVO v17.0: !limparchat — limpa o histórico do chat do grupo ==========
/**
 * Limpa o chat do grupo de forma visual:
 * 1. Apaga as mensagens que o BOT enviou (possível via API)
 * 2. Envia separador visual
 *
 * IMPORTANTE: O WhatsApp não permite deletar mensagens de outros usuários
 * via API — só as mensagens enviadas pelo próprio bot podem ser deletadas.
 * O separador visual facilita identificar onde começa a nova rifa.
 */
async function limparChat(msg, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode usar esse comando!');

    try {
        await msg.reply('🧹 Limpando chat...');

        // Obtém o chat do grupo correto
        let grupoChat = chat.isGroup ? chat : null;
        if (!grupoChat) {
            const grupoConfig = loadGrupo();
            if (grupoConfig && grupoConfig.grupoId) {
                grupoChat = await client.getChatById(grupoConfig.grupoId);
            }
        }

        if (!grupoChat) return msg.reply('❌ Grupo não configurado. Use `grupo` primeiro.');

        // Tenta buscar e deletar mensagens recentes do BOT
        let deletadas = 0;
        try {
            const mensagens = await grupoChat.fetchMessages({ limit: 100 });
            const botId = client.info.wid._serialized;
            for (const m of mensagens) {
                const autorId = m.author || m.from;
                if (autorId === botId || m.fromMe === true) {
                    try { await m.delete(true); deletadas++; } catch(e) {}
                }
            }
        } catch (e) {
            logger.warn('Não foi possível deletar mensagens antigas:', e.message);
        }

        // Envia separador visual chamativo
        const linha = '═'.repeat(30);
        const separador =
            linha + '\n' +
            '    💫 *NOVA RIFA* 💫\n' +
            '    💰🏆 WG PREMIAÇÕES 🏆💰\n' +
            linha + '\n\n' +
            '🎲 Um novo sorteio começa agora!\n' +
            '📋 Confira os bichos disponíveis abaixo ⬇️';

        await grupoChat.sendMessage(separador);

        // Atualiza lista de disponíveis automaticamente
        const data = loadData();
        const rifaInfo = verificarRifaAutomatica();
        if (data.status !== 'fechada') {
            setTimeout(async () => {
                try { await grupoChat.sendMessage(gerarDisponiveis(data, rifaInfo)); } catch(e) {}
            }, 1500);
        }

        const info = deletadas > 0
            ? `✅ Chat limpo! ${deletadas} mensagem(ns) do bot removida(s).\n🎯 Separador visual enviado.`
            : '✅ Separador visual enviado!\n\n💡 _O WhatsApp não permite deletar mensagens de clientes via API — só as mensagens do bot podem ser removidas._';

        logger.info(`🧹 LIMPARCHAT: ${deletadas} msgs deletadas por ${adminId}`);
        return msg.reply(info);

    } catch (e) {
        logger.error('Erro no !limparchat:', e.message);
        return msg.reply('❌ Erro ao limpar chat: ' + e.message);
    }
}


// ========== NOVO v17.2: !exportar — exporta membros do grupo como VCF ==========
async function exportarMembros(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode usar esse comando!');
    await msg.reply('⏳ Buscando membros do grupo...');
    try {
        let grupoChat = chat.isGroup ? chat : null;
        if (!grupoChat) {
            const gc = loadGrupo();
            if (gc && gc.grupoId) grupoChat = await client.getChatById(gc.grupoId);
        }
        if (!grupoChat || !grupoChat.isGroup) {
            return msg.reply('❌ Use esse comando dentro do grupo que quer exportar!\nOu configure o grupo com `grupo` primeiro.');
        }
        const participantes = grupoChat.participants;
        const adminsGrupo = participantes.filter(p => p.isAdmin || p.isSuperAdmin).map(p => p.id._serialized);
        const adminsBot = config.admins || [];
        const membros = participantes.filter(p => {
            const id = p.id._serialized;
            if (adminsGrupo.includes(id)) return false;
            const ni = id.split('@')[0].replace(/\D/g,'').slice(-9);
            if (adminsBot.some(a => (a||'').replace(/\D/g,'').slice(-9) === ni)) return false;
            return true;
        });
        if (membros.length === 0) return msg.reply('📭 Nenhum membro encontrado (sem admins).');

        const subCmd = (args[0] || '').toLowerCase();
        if (subCmd === 'lista') {
            let t = `📋 *MEMBROS DO GRUPO* (${membros.length} pessoas, sem admins)\n\n`;
            membros.forEach((p, i) => { t += `A${i+1}: +${p.id._serialized.split('@')[0]}\n`; });
            t += '\n💡 Copie os números e adicione ao seu grupo!';
            const partes = [];
            let atual = '';
            t.split('\n').forEach(linha => {
                if ((atual + linha + '\n').length > 3800) { partes.push(atual); atual = ''; }
                atual += linha + '\n';
            });
            if (atual) partes.push(atual);
            for (const parte of partes) await msg.reply(parte);
            return;
        }

        const vcfLinhas = [];
        membros.forEach((p, i) => {
            const num = p.id._serialized.split('@')[0];
            const label = 'A' + (i + 1);
            vcfLinhas.push('BEGIN:VCARD');
            vcfLinhas.push('VERSION:3.0');
            vcfLinhas.push('FN:' + label);
            vcfLinhas.push('N:' + label + ';;;;');
            vcfLinhas.push('TEL;TYPE=CELL:+' + num);
            vcfLinhas.push('END:VCARD');
        });
        const vcfPath = path.join(DATA_DIR, 'exportar_temp.vcf');
        fs.writeFileSync(vcfPath, vcfLinhas.join('\r\n'), 'utf8');
        const host = process.env.RENDER_EXTERNAL_URL || process.env.HOST_URL || `http://localhost:${PORT}`;
        const link = `${host}/exportar/${encodeURIComponent(grupoChat.id._serialized)}`;
        let r = `✅ *MEMBROS EXPORTADOS!*\n\n👥 Total: *${membros.length} pessoas* (admins removidos)\n🏷️ Nomeados: A1 até A${membros.length}\n\n🔗 *Baixe o arquivo .vcf:*\n${link}\n\n📱 *Como usar:*\n1. Abra o link no celular\n2. O arquivo .vcf baixa automaticamente\n3. Abra → "Adicionar todos os contatos"\n\n💡 Ou use \`exportar lista\` para ver os números direto aqui.`;
        await msg.reply(r);
        logger.info(`📤 EXPORTAR: ${membros.length} membros`);
    } catch (e) {
        logger.error('Erro ao exportar membros:', e.message);
        return msg.reply('❌ Erro ao exportar: ' + e.message + '\n\nTente: `exportar lista`');
    }
}

// ========== NOVO v17.4: SISTEMA DE DIVULGAÇÃO ==========
const DIVULGAR_FILE = path.join(DATA_DIR, 'divulgar.json');
function loadDivulgar() {
    try { if (fs.existsSync(DIVULGAR_FILE)) return JSON.parse(fs.readFileSync(DIVULGAR_FILE, 'utf8')); } catch (e) {}
    return { ativo: false, enviados: [], totalHoje: 0, dataHoje: '', limitesDia: 20, intervaloMin: 45, intervaloMax: 120, totalEnviados: 0, erros: 0, linkGrupo: '' };
}
function saveDivulgar(d) { try { fs.writeFileSync(DIVULGAR_FILE, JSON.stringify(d, null, 2)); } catch (e) {} }
let divulgarTimer = null;

const MENSAGENS_CONVITE = [
    (link, titulo) => `Olá! 👋\n\nVocê foi convidado(a) para o *${titulo}*! 🎉\n\n🐾 Jogo do Bicho online\n💰 R$0,25 = até R$5,25!\n⚡ Sorteios todos os dias\n\n👇 Entre:\n${link}`,
    (link, titulo) => `Oi! 😊\n\nTe convido pro *${titulo}*! 🏆\n\n✅ Rifa do bicho diária\n✅ R$0,25 por cota\n✅ Premiação até R$5,25!\n\n🔗 ${link}`,
    (link, titulo) => `Olá! 🌟\n\nConheceu o *${titulo}*? 🎲\n\nFácil, rápido e honesto! 💚\n💵 R$0,25 = prêmio de R$5,25\n\n👉 Grupo: ${link}`,
    (link, titulo) => `Oi! 👋\n\nConvite especial pro *${titulo}*! 🎯\n\n📅 Sorteios diários\n💰 Premiação até 23x!\n\n🔗 ${link}\n\nEspero te ver lá! 😄`,
    (link, titulo) => `Salve! ✨\n\nConvite pra o *${titulo}*! 🎊\n\n1️⃣ Entre no grupo\n2️⃣ Escolha seu bicho\n3️⃣ Pague R$1\n4️⃣ Torça! 🍀\n\n👇 ${link}`,
    (link, titulo) => `Boa tarde! ☀️\n\n*${titulo}* é sério e confiável!\n💰 A partir de R$0,25\n🏆 Ganhe até 21x!\n\n🔗 ${link}\n\nVem jogar! 🤑`,
    (link, titulo) => `Oi! 🤩\n\nPassando pra te convidar pro *${titulo}*!\n\n🎲 Bicho todo dia\n💵 R$0,25 por cota\n✅ Pagamento na hora!\n\n👉 ${link}`,
    (link, titulo) => `Olá! 😃\n\nJogue o bicho pelo WhatsApp no *${titulo}*!\n🐾 Escolha o bicho\n💰 R$0,25 = R$5,25\n📲 Vários sorteios por dia!\n\n${link}`,
];
function getMensagemConvite(link, titulo) {
    return MENSAGENS_CONVITE[Math.floor(Math.random() * MENSAGENS_CONVITE.length)](link, titulo);
}
function getIntervaloAleatorio(min, max) { return Math.floor(Math.random() * (max - min + 1) + min) * 1000; }
function horarioPermitido() { const h = getDataHoraAtual().getHours(); return h >= 8 && h < 22; }
function resetarContadorDiario(d) {
    const hoje = new Date().toISOString().slice(0,10);
    if (d.dataHoje !== hoje) { d.dataHoje = hoje; d.totalHoje = 0; }
}

async function enviarProximoConvite() {
    const d = loadDivulgar();
    if (!d.ativo) return;
    resetarContadorDiario(d);
    if (!horarioPermitido()) {
        logger.info('💤 Divulgar: horário noturno — aguardando 8h');
        divulgarTimer = setTimeout(enviarProximoConvite, 30 * 60 * 1000);
        return;
    }
    if (d.totalHoje >= d.limitesDia) {
        logger.info(`📊 Divulgar: limite diário atingido (${d.limitesDia})`);
        divulgarTimer = setTimeout(enviarProximoConvite, (24 - getDataHoraAtual().getHours()) * 3600000);
        return;
    }
    if (!d.linkGrupo) { d.ativo = false; saveDivulgar(d); return; }

    let contatoAlvo = null;
    try {
        const contatos = await client.getContacts();
        const enviados = new Set(d.enviados.map(n => n.replace(/\D/g,'').slice(-9)));
        const meuNum = client.info.wid._serialized.split('@')[0];
        const candidatos = contatos.filter(c => {
            if (!c.number || c.isGroup || c.isMe) return false;
            if (c.id._serialized.includes('@g.us')) return false;
            const num = c.number.replace(/\D/g,'').slice(-9);
            return !enviados.has(num) && num !== meuNum.slice(-9);
        });
        if (candidatos.length === 0) {
            d.ativo = false; saveDivulgar(d);
            for (const adm of config.admins) {
                try { const c = await client.getChatById(adm); await c.sendMessage(`✅ *DIVULGAÇÃO CONCLUÍDA!*\n\n📊 Todos os contatos já foram convidados!\n📈 Total: ${d.totalEnviados}\n\n💡 Use \`divulgar limpar\` para recomeçar.`); } catch(e) {}
            }
            return;
        }
        contatoAlvo = candidatos[Math.floor(Math.random() * Math.min(candidatos.length, 10))];
    } catch (e) { logger.error('Erro ao buscar contatos:', e.message); divulgarTimer = setTimeout(enviarProximoConvite, 60000); return; }

    try {
        const mensagem = getMensagemConvite(d.linkGrupo, config.titulo || 'WG PREMIAÇÕES');
        await client.sendMessage(contatoAlvo.id._serialized, mensagem);
        const num = contatoAlvo.number || contatoAlvo.id._serialized.split('@')[0];
        d.enviados.push(num); d.totalHoje++; d.totalEnviados++;
        saveDivulgar(d);
        logger.info(`📤 Divulgar: enviado para ${num} (hoje: ${d.totalHoje}/${d.limitesDia})`);
    } catch (e) { d.erros++; saveDivulgar(d); logger.error('Erro ao enviar convite:', e.message); }

    divulgarTimer = setTimeout(enviarProximoConvite, getIntervaloAleatorio(d.intervaloMin, d.intervaloMax));
}

async function gerenciarDivulgar(msg, args, adminId) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode usar esse comando!');
    const sub = (args[0] || '').toLowerCase();
    const d = loadDivulgar();

    if (!sub || sub === 'status') {
        resetarContadorDiario(d);
        let t = `📣 *DIVULGAÇÃO DE GRUPO*\n\nStatus: ${d.ativo ? '🟢 ATIVO' : '🔴 PARADO'}\n`;
        t += `📊 Enviados hoje: ${d.totalHoje}/${d.limitesDia}\n`;
        t += `📈 Total geral: ${d.totalEnviados}\n`;
        t += `⏱️ Intervalo: ${d.intervaloMin}s–${d.intervaloMax}s\n`;
        t += `🔗 Link: ${d.linkGrupo || '❌ Não definido'}\n\n`;
        t += `*Comandos:*\n• \`divulgar link https://...\`\n• \`divulgar iniciar\`\n• \`divulgar parar\`\n• \`divulgar limite 30\`\n• \`divulgar intervalo 60 180\`\n• \`divulgar teste 71999...\`\n• \`divulgar limpar\``;
        return msg.reply(t);
    }
    if (sub === 'link') {
        const link = args[1] || '';
        if (!link.startsWith('http')) return msg.reply('❌ Ex: `divulgar link https://chat.whatsapp.com/XXXX`');
        d.linkGrupo = link; saveDivulgar(d);
        return msg.reply('✅ Link salvo:\n' + link);
    }
    if (sub === 'iniciar') {
        if (!d.linkGrupo) return msg.reply('❌ Defina o link primeiro!\n`divulgar link https://chat.whatsapp.com/XXXX`');
        if (d.ativo) return msg.reply('⚠️ Já está ativo! Use `divulgar status`.');
        d.ativo = true; saveDivulgar(d);
        if (divulgarTimer) clearTimeout(divulgarTimer);
        enviarProximoConvite();
        return msg.reply(`✅ *DIVULGAÇÃO INICIADA!*\n\n📊 Limite: ${d.limitesDia}/dia\n⏱️ Intervalo: ${d.intervaloMin}s–${d.intervaloMax}s\n🕐 Horário: 8h–22h\n🔗 ${d.linkGrupo}\n\n💡 Use \`divulgar parar\` para interromper.`);
    }
    if (sub === 'parar' || sub === 'stop') {
        d.ativo = false; saveDivulgar(d);
        if (divulgarTimer) { clearTimeout(divulgarTimer); divulgarTimer = null; }
        return msg.reply(`⏹️ *Divulgação pausada!*\n\n📊 Hoje: ${d.totalHoje} | Total: ${d.totalEnviados}\n\nUse \`divulgar iniciar\` para retomar.`);
    }
    if (sub === 'limite') {
        const lim = parseInt(args[1]);
        if (isNaN(lim) || lim < 1 || lim > 100) return msg.reply('❌ Use número entre 1 e 100.\nEx: `divulgar limite 25`');
        d.limitesDia = lim; saveDivulgar(d);
        return msg.reply(`✅ Limite: *${lim} mensagens/dia*`);
    }
    if (sub === 'intervalo') {
        const minS = parseInt(args[1]), maxS = parseInt(args[2] || args[1]);
        if (isNaN(minS) || minS < 30) return msg.reply('❌ Mínimo 30 segundos.\nEx: `divulgar intervalo 60 120`');
        d.intervaloMin = minS; d.intervaloMax = Math.max(minS, maxS || minS + 60); saveDivulgar(d);
        return msg.reply(`✅ Intervalo: *${d.intervaloMin}s – ${d.intervaloMax}s*`);
    }
    if (sub === 'limpar') {
        d.enviados = []; d.totalHoje = 0; d.dataHoje = ''; d.totalEnviados = 0; d.erros = 0;
        saveDivulgar(d);
        return msg.reply('🗑️ Histórico zerado! Todos os contatos podem ser convidados novamente.');
    }
    if (sub === 'teste') {
        const numTeste = (args[1] || '').replace(/\D/g,'');
        if (numTeste.length < 8) return msg.reply('❌ Ex: `divulgar teste 71999999999`');
        if (!d.linkGrupo) return msg.reply('❌ Defina o link: `divulgar link https://...`');
        try {
            const chatId = '55' + numTeste.replace(/^55/,'') + '@c.us';
            const mensagem = getMensagemConvite(d.linkGrupo, config.titulo || 'WG PREMIAÇÕES');
            await client.sendMessage(chatId, mensagem);
            return msg.reply('✅ Teste enviado para +55' + numTeste);
        } catch (e) { return msg.reply('❌ Erro: ' + e.message); }
    }
    return msg.reply('❌ Subcomando inválido.\n\nUse: `divulgar status`');
}

async function verMinhasApostas(msg, userId) {
    const data = loadData();
    const minhas = data.apostas.filter(a => a.userId === userId && !a.cancelada);
    if (minhas.length === 0) return msg.reply('📭 Você não tem apostas na rifa atual.\n\nUse *disponivel* para ver os bichos!');
    let t = '📋 *MINHAS APOSTAS*\n\n';
    let total = 0, pendentes = 0;
    minhas.forEach((a, i) => {
        const bi = BICHOS[a.bicho];
        const status = a.pago ? '✅ Pago' : '⏳ Pendente';
        if (!a.pago) pendentes++;
        t += (i + 1) + '. ' + bi.emoji + ' ' + bi.nome + ' ' + a.cotas + 'x\n';
        t += '   💰 R$ ' + a.valorPago.toFixed(2) + ' | ' + status + '\n';
        t += '   🆔 ' + a.id.substring(0, 8) + '...\n\n';
        total += a.valorPago;
    });
    t += '💵 *Total:* R$ ' + total.toFixed(2);
    if (pendentes > 0) {
        t += '\n\n⚠️ Você tem ' + pendentes + ' apostas pendentes!\n';
        t += '💳 PIX: ' + config.pixKey + '\n';
        t += '✅ Confirme com: *ok*\n';
        t += '❌ Cancele todas com: *cancelar todos*';
    }
    return msg.reply(t);
}

async function confirmarPagamentoRifa(msg, userId) {
    const data = loadData();
    const pendentes = data.apostas.filter(a => a.userId === userId && !a.pago && !a.cancelada);
    if (pendentes.length === 0) return msg.reply('📭 Você não tem pagamentos pendentes na rifa!');
    let total = 0;
    const nome = pendentes[0].nome;
    pendentes.forEach(a => { a.pago = true; a.dataPagamento = new Date().toISOString(); total += a.valorPago; });
    saveData(data);
    for (const adm of config.admins) {
        try {
            const c = await client.getChatById(adm);
            await c.sendMessage('💰 *PAGAMENTO RIFA*\n\n👤 Usuário: ' + nome + '\n💵 Valor: R$ ' + total.toFixed(2) + '\n📊 Apostas: ' + pendentes.length);
        } catch (e) {}
    }
    return msg.reply('✅ *PAGAMENTO CONFIRMADO!*\n\n💵 Total: R$ ' + total.toFixed(2) + '\n📊 Apostas: ' + pendentes.length + '\n\n🍀 Boa sorte no sorteio!');
}

// ========== BANCA ==========

async function solicitarBanca(msg, args, userId, userName, userNumber, rifaInfo, chat, isPrivate = false) {
    const data = loadData();
    const esgotamento = verificarEsgotamento(data);

    // FIX: Bloquear banca nos minutos :15 (encerramento)
    const agora = getDataHoraAtual();
    const minutoAtual = agora.getMinutes();
    if (minutoAtual === 15 && args.length > 0) {
        // Verifica se tem bichos disponíveis na rifa
        const temBichoRifa = esgotamento.esgotados < esgotamento.total;
        const apostasRifa = extrairApostasFlexivel(args.join(' '));
        if (temBichoRifa && apostasRifa.length > 0) {
            return processarApostaRifa(msg, apostasRifa, userId, userNumber, userName, data, rifaInfo, chat, isPrivate);
        }
        return msg.reply('🔒 *Pedidos para BANCA encerrados!*\n\nOs pedidos de banca encerram nos minutos :15.\nAguarde o próximo horário para fazer pedidos de banca.');
    }

    if (args.length === 0) {
        let mensagem = '🏦 *BANCA WG PREMIAÇÕES* 🏦\n\n💰 R$ 0,25 → R$ 5,00 (bicho)\n💰 R$ 0,25 → R$ 20,00 (dezena)\n\n📝 *COMO JOGAR:*\n• banca vaca 5 leao 3\n• dezena 45 3x\n\n';
        if (esgotamento.disponiveis > 0 && !isPrivate) {
            mensagem += '⚠️ *ATENÇÃO:* Ainda há bichos disponíveis na RIFA!\n💡 Use a rifa para melhor pagamento: R$ 0,25 → R$ 5,25\nPara rifa, digite direto: *vaca 5* (sem "banca")\n\n';
        }
        mensagem += '⏰ Funciona 24h!\n⚠️ Precisa de aprovação do admin';
        return msg.reply(mensagem);
    }

    const texto = args.join(' ');
    const apostas = extrairApostasFlexivel(texto);
    if (apostas.length === 0) return msg.reply('❌ Use: banca vaca 5 leao 3');

    const banca = loadBanca();
    const id = gerarIdBanca(banca);
    let valTot = 0, premTot = 0, itens = [];
    apostas.forEach(ap => {
        const v = ap.quantidade * config.precoPorCota, p = ap.quantidade * config.premiacaoBanca;
        valTot += v; premTot += p;
        itens.push({ tipo: 'bicho', bicho: ap.bicho, nome: ap.nome, cotas: ap.quantidade, valor: v, premio: p });
    });

    const ped = {
        id, tipo: 'banca', userId, nome: userName, numero: userNumber,
        itens, valorTotal: valTot, premioTotal: premTot,
        status: 'pendente', dataSolicitacao: new Date().toISOString(),
        horarioSorteio: rifaInfo.horario, dataSorteio: rifaInfo.data
    };
    banca.pendentes.push(ped);
    saveBanca(banca);

    if (isPrivate) { await notificarAdminNovoPedido(ped, true); return msg.reply('⏳ Pedido enviado para análise do admin.'); }
    await notificarAdminNovoPedido(ped, false);

    let r = '⏳ *SOLICITAÇÃO ENVIADA*\n\n🆔 ID: #' + id + '\n👤 Usuário: ' + userName + '\n\n';
    itens.forEach(i => { r += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x = R$ ' + i.valor.toFixed(2) + '\n'; });
    r += '\n💵 Total: R$ ' + valTot.toFixed(2) + '\n🏆 Prêmio: R$ ' + premTot.toFixed(2) + '\n\n⏳ Aguardando aprovação...';
    return msg.reply(r);
}

async function solicitarDezena(msg, args, userId, userName, userNumber, rifaInfo, chat, isPrivate = false) {
    if (args.length === 0) {
        return msg.reply('🎯 *DEZENA* 🎯\n\n💰 R$ 0,25 → R$ 20,00\n🎲 Acerte 2 números!\n\n📝 *USO:*\n• dezena 45\n• dezena 07 5x\n• dezena 12 34 56');
    }
    const banca = loadBanca();
    const id = gerarIdBanca(banca);
    const dezenas = [];
    let valTot = 0, premTot = 0;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.toLowerCase().endsWith('x')) {
            const q = parseInt(a);
            if (dezenas.length > 0 && !isNaN(q)) dezenas[dezenas.length - 1].cotas = q;
            continue;
        }
        if (/^\d{1,2}$/.test(a)) {
            const d = a.padStart(2, '0');
            if (parseInt(d) >= 0 && parseInt(d) <= 99) dezenas.push({ dezena: d, cotas: 1 });
        }
    }
    if (dezenas.length === 0) return msg.reply('❌ Use: dezena 45 ou dezena 07 5x');
    dezenas.forEach(d => { const v = d.cotas * 1, p = d.cotas * 80; valTot += v; premTot += p; });

    const ped = {
        id, tipo: 'dezena', userId, nome: userName, numero: userNumber,
        dezenas, valorTotal: valTot, premioTotal: premTot,
        status: 'pendente', dataSolicitacao: new Date().toISOString(),
        horarioSorteio: rifaInfo.horario, dataSorteio: rifaInfo.data
    };
    banca.pendentes.push(ped);
    saveBanca(banca);

    if (isPrivate) { await notificarAdminNovoPedido(ped, true); return msg.reply('⏳ Pedido enviado para análise do admin.'); }
    await notificarAdminNovoPedido(ped, false);

    let r = '⏳ *SOLICITAÇÃO DEZENA*\n\n🆔 ID: #' + id + '\n👤 Usuário: ' + userName + '\n\n';
    dezenas.forEach(d => {
        const bc = DEZENA_PARA_BICHO[d.dezena];
        const be = bc ? BICHOS[bc].emoji : '🎯';
        r += be + ' Dezena ' + d.dezena + ' (' + d.cotas + 'x) = R$ ' + d.cotas.toFixed(2) + '\n';
    });
    r += '\n💵 Total: R$ ' + valTot.toFixed(2) + '\n🏆 Prêmio: R$ ' + premTot.toFixed(2) + ' (80x)\n\n⏳ Aguardando aprovação...';
    return msg.reply(r);
}

async function notificarAdminNovoPedido(ped, silencioso = false) {
    if (config.admins.length === 0) return;
    const banca = loadBanca();
    atualizarCachePendentes(banca.pendentes);
    let indiceNumerico = 1;
    for (let i = 0; i < banca.pendentes.length; i++) {
        if (banca.pendentes[i].id === ped.id) { indiceNumerico = i + 1; break; }
    }
    let t = '📢 *NOVO PEDIDO* #' + ped.id + '\n*Índice: ' + indiceNumerico + '*\n\n';
    t += '👤 Usuário: ' + ped.nome + '\n📱 Número: @' + ped.numero + '\n🕐 Horário: ' + ped.horarioSorteio + '\n\n';
    if (ped.tipo === 'banca') {
        ped.itens.forEach(i => { t += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x = R$ ' + i.valor.toFixed(2) + '\n'; });
    } else {
        ped.dezenas.forEach(d => {
            const bc = DEZENA_PARA_BICHO[d.dezena];
            const be = bc ? BICHOS[bc].emoji : '🎯';
            t += be + ' Dezena ' + d.dezena + ' (' + d.cotas + 'x) = R$ ' + d.cotas.toFixed(2) + '\n';
        });
    }
    t += '\n💵 Total: R$ ' + ped.valorTotal.toFixed(2) + '\n🏆 Prêmio: R$ ' + ped.premioTotal.toFixed(2) + '\n\n';
    t += '*APROVAR:*\n✅ `ok ' + indiceNumerico + '`\n❌ `recusar ' + indiceNumerico + '`';
    for (const adm of config.admins) {
        try { const c = await client.getChatById(adm); await c.sendMessage(t, { mentions: [ped.userId] }); } catch (e) {}
    }
}

function atualizarCachePendentes(pendentes) {
    pedidosPendentesCache.clear();
    pendentes.forEach((ped, index) => { pedidosPendentesCache.set(index + 1, ped.id); });
}

async function aprovarPedido(msg, args, adminId) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    if (args.length === 0) return msg.reply('❌ Use: ok 1 (ou ok B1001)');
    const banca = loadBanca();
    let pedidoId = null;
    const input = args[0];
    const numeroIndice = parseInt(input);
    if (!isNaN(numeroIndice) && numeroIndice > 0) {
        atualizarCachePendentes(banca.pendentes);
        pedidoId = pedidosPendentesCache.get(numeroIndice);
        if (!pedidoId) return msg.reply('❌ Pedido #' + numeroIndice + ' não encontrado.\nUse *pendentes* para ver a lista atualizada.');
    } else { pedidoId = input.toUpperCase(); }

    const idx = banca.pendentes.findIndex(p => p.id === pedidoId);
    if (idx === -1) return msg.reply('❌ Pedido não encontrado.');
    const ped = banca.pendentes[idx];
    ped.status = 'aprovado';
    ped.dataAprovacao = new Date().toISOString();
    ped.aprovadoPor = adminId;
    ped.pago = true;
    banca.aprovados.push(ped);
    banca.pendentes.splice(idx, 1);
    saveBanca(banca);
    atualizarCachePendentes(banca.pendentes);

    try {
        const c = await client.getChatById(ped.userId);
        let t = '✅ *PEDIDO APROVADO!*\n\n🆔 ID: #' + ped.id + '\n\n';
        if (ped.tipo === 'banca') {
            ped.itens.forEach(i => { t += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x\n'; });
        } else {
            ped.dezenas.forEach(d => {
                const bc = DEZENA_PARA_BICHO[d.dezena]; const be = bc ? BICHOS[bc].emoji : '🎯';
                t += be + ' Dezena ' + d.dezena + ' (' + d.cotas + 'x)\n';
            });
        }
        t += '\n💵 Valor: R$ ' + ped.valorTotal.toFixed(2) + '\n🏆 Prêmio: R$ ' + ped.premioTotal.toFixed(2) + '\n🕐 Sorteio: ' + ped.horarioSorteio + '\n\n✅ *Status:* Aprovado e Pago\n🍀 Boa sorte no sorteio!';
        await c.sendMessage(t);
    } catch (e) { logger.error('❌ Erro ao notificar cliente da aprovação:', e); }

    return msg.reply('✅ Pedido #' + ped.id + ' APROVADO e PAGO!\n📩 Cliente notificado no PV.');
}

async function recusarPedido(msg, args, adminId) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    if (args.length === 0) return msg.reply('❌ Use: recusar 1 (ou recusar B1001)');
    const banca = loadBanca();
    let pedidoId = null;
    const input = args[0];
    const numeroIndice = parseInt(input);
    if (!isNaN(numeroIndice) && numeroIndice > 0) {
        atualizarCachePendentes(banca.pendentes);
        pedidoId = pedidosPendentesCache.get(numeroIndice);
        if (!pedidoId) return msg.reply('❌ Pedido #' + numeroIndice + ' não encontrado.\nUse *pendentes* para ver a lista atualizada.');
    } else { pedidoId = input.toUpperCase(); }
    const idx = banca.pendentes.findIndex(p => p.id === pedidoId);
    if (idx === -1) return msg.reply('❌ Pedido não encontrado.');
    const ped = banca.pendentes[idx];
    banca.pendentes.splice(idx, 1);
    saveBanca(banca);
    atualizarCachePendentes(banca.pendentes);
    try {
        const c = await client.getChatById(ped.userId);
        await c.sendMessage('❌ *PEDIDO RECUSADO*\n\n🆔 ID: #' + ped.id + '\n\nSeu pedido foi recusado.\nTente novamente ou entre em contato com o admin.');
    } catch (e) { logger.error('Erro ao notificar recusa:', e); }
    return msg.reply('❌ Pedido #' + ped.id + ' RECUSADO.\n📩 Cliente notificado.');
}

async function listarPendentes(msg, adminId) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    const banca = loadBanca();
    if (banca.pendentes.length === 0) return msg.reply('📭 Nenhum pedido pendente.');
    atualizarCachePendentes(banca.pendentes);
    let t = '📋 *PENDENTES* (' + banca.pendentes.length + ')\n\n';
    banca.pendentes.forEach((p, index) => {
        const numero = index + 1;
        t += '*' + numero + '.* 🆔 ' + p.id + ' - ' + p.tipo.toUpperCase() + '\n';
        t += '   👤 ' + p.nome + ' | 🕐 ' + p.horarioSorteio + '\n';
        t += '   💵 R$ ' + p.valorTotal.toFixed(2) + '\n';
        t += '   ✅ ok ' + numero + '\n';
        t += '   ❌ recusar ' + numero + '\n\n';
    });
    t += '_Use os números (1, 2, 3...) para aprovar/recusar rapidamente!_';
    return msg.reply(t);
}

async function confirmarPagamentoBanca(msg, args, userId) {
    if (args.length === 0) return msg.reply('❌ Use: pagobanca B1001');
    const id = args[0].toUpperCase();
    const banca = loadBanca();
    const ped = banca.aprovados.find(p => p.id === id && p.userId === userId);
    if (!ped) return msg.reply('❌ Pedido não encontrado.');
    if (ped.pago) return msg.reply('⚠️ Já está pago!');
    ped.pago = true;
    ped.dataPagamento = new Date().toISOString();
    saveBanca(banca);
    for (const adm of config.admins) {
        try {
            const c = await client.getChatById(adm);
            await c.sendMessage('💰 *PAGAMENTO BANCA*\n\n🆔 ID: #' + id + '\n👤 Usuário: ' + ped.nome + '\n💵 R$ ' + ped.valorTotal.toFixed(2));
        } catch (e) {}
    }
    return msg.reply('✅ *PAGAMENTO CONFIRMADO!*\n\n🆔 ID: #' + id + '\n💵 R$ ' + ped.valorTotal.toFixed(2) + '\n\n🍀 Boa sorte!');
}

async function verMinhaBanca(msg, userId) {
    const banca = loadBanca();
    const meus = banca.aprovados.filter(p => p.userId === userId && p.pago);
    if (meus.length === 0) return msg.reply('📭 Você não tem jogos na banca.\n\n📝 Use: banca vaca 5');
    let t = '🏦 *MINHA BANCA*\n\n';
    let totInv = 0, totPrem = 0;
    meus.forEach(j => {
        t += '🆔 ' + j.id + ' - 🕐 ' + j.horarioSorteio + '\n';
        if (j.tipo === 'banca') {
            j.itens.forEach(i => { t += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x\n'; });
        } else {
            j.dezenas.forEach(d => {
                const bc = DEZENA_PARA_BICHO[d.dezena]; const be = bc ? BICHOS[bc].emoji : '🎯';
                t += be + ' Dezena ' + d.dezena + ' (' + d.cotas + 'x)\n';
            });
        }
        t += '💵 R$ ' + j.valorTotal.toFixed(2) + ' → 🏆 R$ ' + j.premioTotal.toFixed(2) + '\n\n';
        totInv += j.valorTotal; totPrem += j.premioTotal;
    });
    t += '═══════════════════\n💵 Total: R$ ' + totInv.toFixed(2) + '\n🏆 Potencial: R$ ' + totPrem.toFixed(2);
    return msg.reply(t);
}

// ========== COMANDOS ADMIN ==========

async function colocarApostaManual(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    let targetId = null, targetName = null, numeroDestino = null, textoAposta = '';

    if (msg.hasQuotedMsg) {
        try {
            const q = await msg.getQuotedMessage();
            targetId = q.author || q.from;
            targetName = await getContactName(q);
            numeroDestino = targetId.split('@')[0];
            const bodyParts = msg.body.split(' ');
            bodyParts.shift();
            textoAposta = bodyParts.join(' ');
        } catch (e) { return msg.reply('❌ Erro ao obter mensagem citada.'); }
    } else if (args.length >= 2) {
        const possivelNumero = args[0].replace(/[^\d]/g, '');
        if (possivelNumero.length >= 10) {
            targetId = possivelNumero + '@c.us'; numeroDestino = possivelNumero;
            targetName = 'Cliente ' + possivelNumero; textoAposta = args.slice(1).join(' ');
        } else {
            targetId = adminId; targetName = await getContactName(msg);
            numeroDestino = adminId.split('@')[0]; textoAposta = args.join(' ');
        }
    } else if (args.length >= 1) {
        targetId = adminId; targetName = await getContactName(msg);
        numeroDestino = adminId.split('@')[0]; textoAposta = args.join(' ');
    } else {
        return msg.reply('❌ *Use:*\n• Responda msg + colocar vaca 5\n• Ou: colocar 5511999999999 vaca 5\n• Ou: colocar vaca 5 (para si mesmo)');
    }

    if (!textoAposta.trim()) return msg.reply('❌ Especifique os bichos! Ex: colocar vaca 5');

    const { itensRifa, itensBanca } = separarRifaBanca(textoAposta);

    if (itensRifa.length === 0 && itensBanca.length === 0) {
        return msg.reply('❌ Não entendi os bichos. Verifique e tente novamente.');
    }

    let data = loadData();
    const rifaInfo = verificarRifaAutomatica();
    const num = numeroDestino || targetId.split('@')[0];

    let regRifa = [], bichosEsgotadosParaBanca = [], bichosNaoColocados = [];
    let totCotasRifa = 0, totValRifa = 0;

    for (let ap of itensRifa) {
        const { bicho, quantidade } = ap;
        const gd = data[bicho];
        if (!gd) continue;
        const disp = gd.cotasDisponiveis;

        if (disp === 0) {
            bichosEsgotadosParaBanca.push({ bicho, nome: BICHOS[bicho].nome, emoji: BICHOS[bicho].emoji, quantidade });
        } else {
            const real = Math.min(quantidade, disp);
            const sobra = quantidade - real;

            const na = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
                userId: targetId, numeroUsuario: num, nome: targetName, bicho,
                cotas: real, valorPago: real * config.precoPorCota,
                premiacaoPotencial: real * config.premiacaoPorCota,
                pago: true, data: new Date().toISOString(), colocadoPor: adminId, manual: true
            };
            data.apostas.push(na);
            gd.cotasDisponiveis -= real;
            gd.cotasVendidas += real;
            if (!gd.apostas) gd.apostas = [];
            gd.apostas.push({ userId: targetId, numeroUsuario: num, cotas: real, pago: true });
            regRifa.push({ nome: BICHOS[bicho].nome, emoji: BICHOS[bicho].emoji, cotas: real });
            totCotasRifa += real;
            totValRifa += real * config.precoPorCota;

            if (sobra > 0) {
                bichosEsgotadosParaBanca.push({ bicho, nome: BICHOS[bicho].nome, emoji: BICHOS[bicho].emoji, quantidade: sobra });
            }
        }
    }

    if (regRifa.length > 0 || bichosEsgotadosParaBanca.length > 0) {
        saveData(data);
    }

    const esgotamento = verificarEsgotamento(data);
    if (esgotamento.esgotou && data.status !== 'fechada') await fecharRifaAutomaticamente(chat, data);

    const todosBancaItens = [
        ...itensBanca,
        ...bichosEsgotadosParaBanca
    ];

    let regBanca = null;
    let totCotasBanca = 0, totValBanca = 0;

    if (todosBancaItens.length > 0) {
        const banca = loadBanca();
        const idB = gerarIdBanca(banca);
        let itensBancaRegistro = [];
        todosBancaItens.forEach(s => {
            const v = s.quantidade * 1;
            const p = s.quantidade * config.premiacaoBanca;
            itensBancaRegistro.push({ tipo: 'bicho', bicho: s.bicho, nome: BICHOS[s.bicho].nome, cotas: s.quantidade, valor: v, premio: p });
            totCotasBanca += s.quantidade;
            totValBanca += v;
        });

        const pedBanca = {
            id: idB,
            tipo: 'banca',
            userId: targetId,
            nome: targetName,
            numero: num,
            itens: itensBancaRegistro,
            valorTotal: totValBanca,
            premioTotal: (totValBanca / config.precoPorCota) * config.premiacaoBanca,
            status: 'aprovado',
            pago: true,
            dataSolicitacao: new Date().toISOString(),
            dataAprovacao: new Date().toISOString(),
            aprovadoPor: adminId,
            horarioSorteio: rifaInfo.horario,
            dataSorteio: rifaInfo.data,
            origem: 'manual_admin'
        };
        banca.aprovados.push(pedBanca);
        saveBanca(banca);
        regBanca = pedBanca;

        try {
            const c = await client.getChatById(targetId);
            let msgPv = '🏦 *BANCA REGISTRADA!*\n\n🆔 ID: #' + idB + '\n\n';
            itensBancaRegistro.forEach(i => { msgPv += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x\n'; });
            msgPv += '\n💵 Valor: R$ ' + totValBanca.toFixed(2) + '\n🏆 Prêmio: R$ ' + (totValBanca * 20).toFixed(2) + '\n🕐 Sorteio: ' + rifaInfo.horario + '\n✅ Status: Pago\n\n🍀 Boa sorte!';
            await c.sendMessage(msgPv);
        } catch (e) { logger.warn('Não foi possível notificar cliente no PV para banca:', e.message); }
    }

    let r = '✅ *APOSTA MANUAL REGISTRADA*\n\n';
    r += '👤 Usuário: ' + targetName + '\n';
    r += '📱 Número: ' + num + '\n\n';

    if (regRifa.length > 0) {
        r += '🎟️ *NA RIFA:*\n';
        regRifa.forEach(x => { r += x.emoji + ' ' + x.nome + ' ' + x.cotas + 'x\n'; });
        r += '💵 R$ ' + totValRifa.toFixed(2) + ' ✅ Pago\n\n';
    }

    if (regBanca) {
        const bExplicitos = itensBanca.map(b => b.nome);
        const bEsgotados = bichosEsgotadosParaBanca.map(b => b.nome);

        r += '🏦 *NA BANCA:*\n';
        regBanca.itens.forEach(i => {
            const origem = bEsgotados.includes(i.nome) && !bExplicitos.includes(i.nome) ? ' ⚠️(esgotado na rifa)' : '';
            r += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x' + origem + '\n';
        });
        r += '🆔 ID Banca: #' + regBanca.id + '\n';
        r += '💵 R$ ' + totValBanca.toFixed(2) + ' ✅ Pago\n';
        r += '🏆 Prêmio: R$ ' + (totValBanca * 20).toFixed(2) + '\n\n';
    }

    if (regRifa.length === 0 && !regBanca) {
        return msg.reply('❌ Nenhum bicho foi registrado. Verifique disponibilidade.');
    }

    await msg.reply(r);

    const dataAtual = loadData();
    if (dataAtual.status !== 'fechada') {
        return chat.sendMessage(gerarDisponiveis(dataAtual, rifaInfo));
    }
}

async function colocarBancaManual(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    let targetId = null, targetName = null, numeroDestino = null, textoAposta = '';
    if (msg.hasQuotedMsg) {
        try {
            const q = await msg.getQuotedMessage();
            targetId = q.author || q.from; targetName = await getContactName(q);
            numeroDestino = targetId.split('@')[0];
            const bodyParts = msg.body.split(' '); bodyParts.shift(); textoAposta = bodyParts.join(' ');
        } catch (e) { return msg.reply('❌ Erro ao obter mensagem citada.'); }
    } else if (args.length >= 2) {
        const possivelNumero = args[0].replace(/[^\d]/g, '');
        if (possivelNumero.length >= 10) {
            targetId = possivelNumero + '@c.us'; numeroDestino = possivelNumero;
            targetName = 'Cliente ' + possivelNumero; textoAposta = args.slice(1).join(' ');
        } else { return msg.reply('❌ Número inválido. Use: colocarbanca 5511999999999 vaca 5'); }
    } else { return msg.reply('❌ *Use:*\n• Responda msg + colocarbanca vaca 5\n• Ou: colocarbanca 5511999999999 vaca 5'); }
    if (!textoAposta.trim()) return msg.reply('❌ Especifique os bichos!');
    const apostas = extrairApostasFlexivel(textoAposta);
    if (apostas.length === 0) return msg.reply('❌ Não entendi os bichos.');
    const rifaInfo = verificarRifaAutomatica();
    const banca = loadBanca();
    const id = gerarIdBanca(banca);
    let valTot = 0, premTot = 0, itens = [];
    apostas.forEach(ap => {
        const v = ap.quantidade * config.precoPorCota, p = ap.quantidade * config.premiacaoBanca;
        valTot += v; premTot += p;
        itens.push({ tipo: 'bicho', bicho: ap.bicho, nome: ap.nome, cotas: ap.quantidade, valor: v, premio: p });
    });
    const ped = {
        id, tipo: 'banca', userId: targetId, nome: targetName, numero: numeroDestino,
        itens, valorTotal: valTot, premioTotal: premTot,
        status: 'aprovado', pago: true,
        dataSolicitacao: new Date().toISOString(), dataAprovacao: new Date().toISOString(),
        aprovadoPor: adminId, horarioSorteio: rifaInfo.horario, dataSorteio: rifaInfo.data, origem: 'manual_admin'
    };
    banca.aprovados.push(ped);
    saveBanca(banca);
    try {
        const c = await client.getChatById(targetId);
        let t = '✅ *BANCA REGISTRADA PELO ADMIN*\n\n🆔 ID: #' + id + '\n\n';
        itens.forEach(i => { t += BICHOS[i.bicho].emoji + ' ' + i.nome + ' ' + i.cotas + 'x\n'; });
        t += '\n💵 Valor: R$ ' + valTot.toFixed(2) + '\n🏆 Prêmio: R$ ' + premTot.toFixed(2) + '\n🕐 Sorteio: ' + rifaInfo.horario + '\n✅ Status: Pago\n\n🍀 Boa sorte!';
        await c.sendMessage(t);
    } catch (e) { logger.error('Erro ao notificar cliente:', e); }
    return msg.reply('✅ *BANCA MANUAL REGISTRADA*\n\n👤 Cliente: ' + targetName + '\n🆔 ID: #' + id + '\n💵 R$ ' + valTot.toFixed(2) + '\n\n📩 Cliente notificado no PV.');
}

async function notificarCliente(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    let targetId = null, targetName = null;

    if (msg.hasQuotedMsg) {
        try {
            const quotedMsg = await msg.getQuotedMessage();
            targetId = quotedMsg.author || quotedMsg.from;
            targetName = await getContactName(quotedMsg);
        } catch (e) { return msg.reply('❌ Erro ao obter mensagem citada.'); }
    } else if (args.length >= 1) {
        const numero = args[0].replace(/[^\d]/g, '');
        if (numero.length >= 8) {
            let idEncontrado = null;
            try {
                const participants = chat.participants || [];
                for (const p of participants) {
                    if (p.id.user === numero || p.id._serialized.includes(numero)) {
                        idEncontrado = p.id._serialized;
                        break;
                    }
                }
            } catch (e) {}
            targetId = idEncontrado || (numero + '@c.us');
            targetName = numero;
        } else {
            return msg.reply('❌ Número inválido. Use pelo menos 8 dígitos.');
        }
    } else {
        return msg.reply('❌ *Use:*\n• Responda a mensagem do cliente + `notificar`\n• Ou: `notificar 71999999999`');
    }

    try {
        const numero = targetId.split('@')[0];
        const mensagem = `@${numero} qual bicho eu marco pra você? 🤑`;

        const mentionIds = [targetId];
        if (targetId.endsWith('@c.us')) mentionIds.push(targetId.replace('@c.us', '@lid'));
        else if (targetId.endsWith('@lid')) mentionIds.push(targetId.replace('@lid', '@c.us'));

        await chat.sendMessage(mensagem, { mentions: mentionIds });

        try {
            const admChat = await client.getChatById(adminId);
            await admChat.sendMessage(`✅ Cliente @${numero} notificado no grupo!`);
        } catch (e) {}

    } catch (e) {
        logger.error('Erro ao notificar cliente:', e);
        return msg.reply('❌ Erro ao notificar: ' + e.message);
    }
}

async function notificarTodos(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    try {
        let participants = chat.participants;
        if (!participants || participants.length === 0) {
            try { await chat.fetchParticipants(); participants = chat.participants; } catch (e) {}
        }
        if (!participants || participants.length === 0) {
            return msg.reply('❌ Não foi possível obter participantes.\nO bot precisa ser admin do grupo.');
        }

        const mensagemPersonalizada = args.join(' ').trim() || 'qual bicho eu marco pra você? 🤑';
        const botUser = client.info?.wid?.user || '';
        const membros = participants.filter(p => p.id.user !== botUser);

        const todasMencoes = [];
        membros.forEach(p => {
            todasMencoes.push(p.id._serialized);
            if (p.id._serialized.endsWith('@c.us')) {
                todasMencoes.push(p.id._serialized.replace('@c.us', '@lid'));
            } else if (p.id._serialized.endsWith('@lid')) {
                todasMencoes.push(p.id._serialized.replace('@lid', '@c.us'));
            }
        });

        // FIX v14.2: Mensagem LIMPA sem mostrar @números explícitos no chat
        // As menções vão silenciosamente no parâmetro mentions do WhatsApp
        const mensagemLimpa = '👥 *Pessoal!*\n\n' + mensagemPersonalizada;
        
        await chat.sendMessage(mensagemLimpa, { mentions: todasMencoes });

        try {
            const admChat = await client.getChatById(adminId);
            await admChat.sendMessage(`✅ Notificação enviada para ${membros.length} pessoas no grupo!`);
        } catch (e) {
            await msg.reply(`✅ ${membros.length} pessoas notificadas!`);
        }

    } catch (e) {
        logger.error('Erro ao notificar todos:', e);
        return msg.reply('❌ Erro: ' + e.message);
    }
}

async function iniciarRifa(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    const agora = getDataHoraAtual();
    let horario = null, tipo = 'BAHIA';
    if (args.length > 0) {
        const horarioMatch = args[0].match(/(\d{1,2}):(\d{2})/);
        if (horarioMatch) { horario = args[0]; if (horario === '20:00') tipo = 'FEDERAL'; }
    }
    if (!horario) { const rifaInfo = verificarRifaAutomatica(); horario = rifaInfo.horario; tipo = rifaInfo.tipo; }
    config.horarioManual = horario;
    config.dataManual = agora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    saveConfig();
    // FIX v16.0: Reset rifa + banca para zerar valores
    const novoData = createNewRifaData();
    saveBanca({ pendentes: [], aprovados: [], contadorId: 1000 });
    logger.info('🔄 Banca resetada junto com nova rifa');
    const rifaInfo = { tipo, horario, data: config.dataManual, ativa: true };
    await msg.reply('✅ *RIFA INICIADA!*\n\n🎲 Tipo: ' + tipo + '\n🕐 Horário: ' + horario + '\n📅 Data: ' + config.dataManual + '\n📊 Cotas: ' + config.cotasPorBicho + ' por bicho\n✅ Valores zerados!');
    return chat.sendMessage(gerarDisponiveis(novoData, rifaInfo));
}

async function resetarRifa(msg, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin pode resetar!');
    try {
        config.horarioManual = null; config.dataManual = null; saveConfig();
        if (fs.existsSync(DATA_FILE)) { fs.unlinkSync(DATA_FILE); logger.info('🗑️ Arquivo data deletado'); }
        // FIX v16.0: Reset banca junto
        saveBanca({ pendentes: [], aprovados: [], contadorId: 1000 });
        logger.info('🗑️ Banca resetada');
        const novoData = createNewRifaData();
        await msg.reply('🔄 *RIFA RESETADA!*\n\n✅ Apostas zeradas!\n✅ Banca zerada!\n✅ Valores zerados!');
        const rifaInfo = verificarRifaAutomatica();
        return chat.sendMessage(gerarDisponiveis(novoData, rifaInfo));
    } catch (e) { logger.error('❌ Erro no reset:', e); return msg.reply('❌ Erro ao resetar: ' + e.message); }
}

async function atualizarRifa(msg, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    const data = loadData();
    const rifaInfo = verificarRifaAutomatica();
    await msg.reply('🔄 Atualizando lista...');
    ultimaAtualizacao = Date.now();
    return chat.sendMessage(gerarDisponiveis(data, rifaInfo));
}

async function definirQuantidade(msg, args, adminId) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    if (args.length === 0) return msg.reply('📊 *Quantidade atual:* ' + config.cotasPorBicho + '\n\n*Use:* quantidade [número]\n*Exemplo:* quantidade 15');
    const novaQtd = parseInt(args[0]);
    if (isNaN(novaQtd) || novaQtd < 1 || novaQtd > 50) return msg.reply('❌ Quantidade inválida! Use um número entre 1 e 50.');
    config.cotasPorBicho = novaQtd; config.maxApostaPorBicho = novaQtd; saveConfig();
    const data = loadData();
    Object.keys(BICHOS).forEach(g => {
        if (data[g]) { const vendidas = data[g].cotasVendidas || 0; data[g].cotasDisponiveis = Math.max(0, novaQtd - vendidas); }
    });
    saveData(data);
    return msg.reply('✅ *Quantidade atualizada!*\n\n📊 Cotas por bicho: ' + novaQtd);
}

async function abrirRifa(msg, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    // Abrir grupo para todos enviarem mensagens
    try {
        const grupoConfig = loadGrupo();
        if (grupoConfig && grupoConfig.grupoId) {
            const grupoChat = await client.getChatById(grupoConfig.grupoId);
            await grupoChat.setMessagesAdminsOnly(false);
            logger.info('🔓 Grupo ABERTO para todos');
        }
    } catch (e) { logger.error('Erro ao abrir grupo:', e.message); }
    const data = loadData();
    data.status = 'aberta'; saveData(data);
    await msg.reply('✅ *RIFA ABERTA!*');
    const rifaInfo = verificarRifaAutomatica();
    return chat.sendMessage(gerarDisponiveis(data, rifaInfo));
}

async function fecharRifa(msg, adminId) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    const data = loadData();
    data.status = 'fechada'; data.dataFechamento = new Date().toISOString(); saveData(data);
    // Fechar grupo para somente admins
    try {
        const grupoConfig = loadGrupo();
        if (grupoConfig && grupoConfig.grupoId) {
            const grupoChat = await client.getChatById(grupoConfig.grupoId);
            await grupoChat.setMessagesAdminsOnly(true);
            logger.info('🔒 Grupo FECHADO (somente admins)');
        }
    } catch (e) { logger.error('Erro ao fechar grupo:', e.message); }
    return msg.reply('🔒 *RIFA FECHADA!*\\n✅ Grupo fechado para clientes.');
}

async function verValores(msg, userId, admin) {
    const data = loadData();
    const banca = loadBanca();

    const clientes = {};

    // Consolidar valores de rifa
    data.apostas.forEach(a => {
        if (a.cancelada) return;
        if (!clientes[a.userId]) {
            clientes[a.userId] = { nome: a.nome, numero: a.numeroUsuario, pago: 0, pendente: 0 };
        }
        const val = parseFloat(a.valorPago) || 0;
        if (a.pago === true || a.pago === 'true') clientes[a.userId].pago += val;
        else clientes[a.userId].pendente += val;
    });

    // Consolidar valores de banca aprovados
    banca.aprovados.forEach(p => {
        if (!clientes[p.userId]) {
            clientes[p.userId] = { nome: p.nome, numero: p.numero, pago: 0, pendente: 0 };
        }
        const val = parseFloat(p.valorTotal) || 0;
        if (p.pago === true || p.pago === 'true') clientes[p.userId].pago += val;
        else clientes[p.userId].pendente += val;
    });

    // Consolidar valores de banca pendentes
    banca.pendentes.forEach(p => {
        if (!clientes[p.userId]) {
            clientes[p.userId] = { nome: p.nome, numero: p.numero, pago: 0, pendente: 0 };
        }
        const val = parseFloat(p.valorTotal) || 0;
        clientes[p.userId].pendente += val;
    });

    if (Object.keys(clientes).length === 0) return msg.reply('📭 Nenhum valor registrado ainda.');

    // Para não-admin, mostra apenas seus próprios valores
    // Para admin, mostra todos os clientes
    let t = '🎀 *LISTA DE VALORES* 🎀\n';
    t += '═══════════════════════\n\n';

    let totalGeralPago = 0, totalGeralPendente = 0;

    const userIdAlt = userId.endsWith('@c.us')
        ? userId.replace('@c.us', '@lid')
        : userId.replace('@lid', '@c.us');
    const userNumPuroVal = userId.split('@')[0];

    const entradas = admin 
        ? Object.entries(clientes)
        : Object.entries(clientes).filter(([uId, v]) => 
            uId === userId || 
            uId === userIdAlt ||
            (v.numero && v.numero === userNumPuroVal)
          );

    if (entradas.length === 0 && !admin) {
        return msg.reply('📭 Você não tem valores registrados ainda.\n\n💡 Faça sua aposta no grupo!');
    }

    entradas.forEach(([uId, v]) => {
        const totalCliente = v.pago + v.pendente;

        if (totalCliente <= 0) return;

        t += `👤 *${v.nome}*\n`;
        t += `📱 ${v.numero}\n`;

        // Mostrar apenas valores consolidados (sem separar rifa/banca)
        if (v.pago > 0) t += `✅ Pago: R$ ${v.pago.toFixed(2)}\n`;
        if (v.pendente > 0) t += `⏳ Pendente: R$ ${v.pendente.toFixed(2)}\n`;
        
        t += `💰 *Total: R$ ${totalCliente.toFixed(2)}*\n\n`;

        totalGeralPago += v.pago;
        totalGeralPendente += v.pendente;
    });

    t += '═══════════════════════\n';
    t += '*📊 RESUMO GERAL*\n\n';
    t += `✅ *Total recebido: R$ ${totalGeralPago.toFixed(2)}*\n`;
    if (totalGeralPendente > 0) {
        t += `⏳ *A receber: R$ ${totalGeralPendente.toFixed(2)}*\n`;
        t += `💵 *Total geral: R$ ${(totalGeralPago + totalGeralPendente).toFixed(2)}*`;
    }

    return msg.reply(t);
}

async function definirGrupo(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas administradores podem definir o grupo!\n\nSeu ID: ' + adminId);
    const grupo = loadGrupo();
    grupo.grupoId = chat.id._serialized;
    saveGrupo(grupo);
    config.grupoNotificacao = chat.id._serialized;
    config.notifGrupoId = chat.id._serialized;
    saveConfig();
    if (config.notifAuto) iniciarNotifAuto();
    return msg.reply('✅ *Grupo definido como oficial!*\n\n📍 ID: `' + chat.id._serialized + '`\n\nEste grupo agora é o grupo principal da rifa.');
}

async function addAdmin(msg, args, adminId) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');
    if (args.length === 0) return msg.reply('❌ *Use:*\naddadmin @numero\naddadmin 5511999999999');
    let novoAdmin = args[0].replace(/[^\d]/g, '');
    if (novoAdmin.length < 10) return msg.reply('❌ Número inválido!');
    if (!novoAdmin.includes('@')) novoAdmin = novoAdmin + '@c.us';
    if (config.admins.includes(novoAdmin)) return msg.reply('⚠️ Este número já é admin!');
    config.admins.push(novoAdmin);
    saveConfig();
    return msg.reply('✅ *Admin adicionado:*\n`' + novoAdmin + '`');
}

// ========== NOTIFICAÇÃO AUTOMÁTICA ==========

function iniciarNotifAuto() {
    pararNotifAuto();

    // FIX: Se notifGrupoId não está na config, tenta recuperar do grupo.json
    if (!config.notifGrupoId) {
        const grupo = loadGrupo();
        if (grupo && grupo.grupoId) {
            config.notifGrupoId = grupo.grupoId;
            config.grupoNotificacao = grupo.grupoId;
            saveConfig();
            logger.info('📣 notifGrupoId recuperado do grupo.json: ' + config.notifGrupoId);
        }
    }

    if (!config.notifAuto || !config.notifGrupoId) {
        logger.warn('⚠️ Notificação automática NÃO iniciada: notifAuto=' + config.notifAuto + ' | notifGrupoId=' + config.notifGrupoId);
        return;
    }

    const intervaloMs = (config.notifIntervalo || 2) * 60 * 1000;

    notifTimer = setInterval(async () => {
        if (!isReady || !config.notifAuto || !config.notifGrupoId) return;
        try {
            const chat = await client.getChatById(config.notifGrupoId);

            // FIX: fetchParticipants com log detalhado de erro
            let participants = chat.participants;
            if (!participants || participants.length === 0) {
                try {
                    await chat.fetchParticipants();
                    participants = chat.participants;
                    logger.info('📋 Participantes buscados: ' + (participants ? participants.length : 0));
                } catch (fetchErr) {
                    logger.error('❌ fetchParticipants falhou (bot precisa ser admin do grupo): ' + fetchErr.message);
                    // Mesmo sem lista, tenta enviar sem menções individuais
                    await chat.sendMessage(config.notifMensagem);
                    logger.info('📣 Notificação enviada sem menções (bot não é admin do grupo)');
                    return;
                }
            }

            if (!participants || participants.length === 0) {
                logger.warn('⚠️ Nenhum participante encontrado no grupo ' + config.notifGrupoId);
                // Envia mensagem sem menções
                await chat.sendMessage(config.notifMensagem);
                return;
            }

            const botUser = client.info?.wid?.user || '';
            const membros = participants.filter(p => p.id.user !== botUser);

            // FIX CRÍTICO: O WhatsApp exige que o TEXTO da mensagem contenha @numero
            // para cada pessoa mencionada. Sem isso, as menções são ignoradas.
            const mencoes = [];
            const tagsNoTexto = [];

            membros.forEach(p => {
                const numero = p.id.user;
                tagsNoTexto.push('@' + numero);
                mencoes.push(p.id._serialized);
                // Adiciona variante @lid/@c.us para compatibilidade
                if (p.id._serialized.endsWith('@c.us')) {
                    mencoes.push(p.id._serialized.replace('@c.us', '@lid'));
                } else if (p.id._serialized.endsWith('@lid')) {
                    mencoes.push(p.id._serialized.replace('@lid', '@c.us'));
                }
            });

            // Mensagem limpa sem mostrar @números — menções silenciosas igual ao manual
            const mensagemFinal = config.notifMensagem;

            await chat.sendMessage(mensagemFinal, { mentions: mencoes });
            logger.info('📣 Notificação automática enviada para ' + membros.length + ' membros');
        } catch (e) {
            logger.error('❌ Erro na notificação automática: ' + e.message);
        }
    }, intervaloMs);

    logger.info('📣 Notificação automática INICIADA: a cada ' + config.notifIntervalo + ' minuto(s) | Grupo: ' + config.notifGrupoId);
}

function pararNotifAuto() {
    if (notifTimer) {
        clearInterval(notifTimer);
        notifTimer = null;
        logger.info('🔕 Notificação automática parada');
    }
}

async function configurarNotifAuto(msg, args, adminId, chat) {
    if (!isAdmin(adminId)) return msg.reply('❌ Apenas admin!');

    // FIX: Sempre atualiza notifGrupoId com o grupo atual se o comando vier de um grupo
    if (chat.isGroup && !config.notifGrupoId) {
        config.notifGrupoId = chat.id._serialized;
        config.grupoNotificacao = chat.id._serialized;
        saveConfig();
        // Também salva no grupo.json para consistência
        const grupo = loadGrupo();
        grupo.grupoId = chat.id._serialized;
        saveGrupo(grupo);
        logger.info('📣 notifGrupoId definido automaticamente: ' + config.notifGrupoId);
    }

    if (args.length === 0) {
        const status = config.notifAuto ? '✅ ATIVADA' : '❌ DESATIVADA';
        const timerStatus = notifTimer ? '⏱️ Timer rodando' : '⏸️ Timer parado';
        return msg.reply(
            '📣 *NOTIFICAÇÃO AUTOMÁTICA*\n\n' +
            'Status: ' + status + '\n' +
            'Timer: ' + timerStatus + '\n' +
            'Intervalo: ' + (config.notifIntervalo || 2) + ' minutos\n' +
            'Mensagem: ' + (config.notifMensagem || '(não definida)') + '\n' +
            'Grupo ID: ' + (config.notifGrupoId ? '✅ ' + config.notifGrupoId.substring(0, 20) + '...' : '❌ Não definido') + '\n\n' +
            '*Comandos:*\n' +
            '• `notifauto on` → ativa\n' +
            '• `notifauto off` → desativa\n' +
            '• `notifauto 3` → define intervalo para 3 minutos\n' +
            '• `notifauto msg Venha jogar! 🎲` → define mensagem\n' +
            '• `notifauto on 5 Venha jogar!` → ativa com intervalo e msg\n\n' +
            '⚠️ O bot precisa ser *admin do grupo* para buscar participantes!'
        );
    }

    const sub = args[0].toLowerCase();

    if (sub === 'off') {
        config.notifAuto = false;
        saveConfig();
        pararNotifAuto();
        return msg.reply('🔕 *Notificação automática DESATIVADA!*');
    }

    if (sub === 'on') {
        // FIX: Sempre usa o grupo atual se disponível, sobrepondo qualquer valor salvo
        if (chat.isGroup) {
            config.notifGrupoId = chat.id._serialized;
            config.grupoNotificacao = chat.id._serialized;
            // Salva também no grupo.json
            const grupo = loadGrupo();
            grupo.grupoId = chat.id._serialized;
            saveGrupo(grupo);
        }

        if (args[1] && !isNaN(parseInt(args[1]))) {
            config.notifIntervalo = Math.max(1, parseInt(args[1]));
            if (args.length > 2) config.notifMensagem = args.slice(2).join(' ');
        } else if (args.length > 1) {
            config.notifMensagem = args.slice(1).join(' ');
        }

        config.notifAuto = true;
        saveConfig();
        iniciarNotifAuto();

        return msg.reply(
            '📣 *Notificação automática ATIVADA!*\n\n' +
            '⏱️ A cada: ' + config.notifIntervalo + ' minuto(s)\n' +
            '💬 Mensagem: ' + config.notifMensagem + '\n' +
            '📍 Grupo: ' + (config.notifGrupoId ? config.notifGrupoId.substring(0, 25) + '...' : '❌ Não definido') + '\n\n' +
            (notifTimer ? '✅ Timer iniciado com sucesso!' : '❌ Falha ao iniciar timer - verifique se o grupo está definido')
        );
    }

    const num = parseInt(sub);
    if (!isNaN(num) && num >= 1) {
        config.notifIntervalo = num;
        saveConfig();
        if (config.notifAuto) iniciarNotifAuto();
        return msg.reply('⏱️ Intervalo atualizado para *' + num + ' minuto(s)*\n' + (config.notifAuto ? '🔄 Timer reiniciado!' : 'Use `notifauto on` para ativar.'));
    }

    if (sub === 'msg') {
        if (args.length < 2) return msg.reply('❌ Use: notifauto msg Sua mensagem aqui');
        config.notifMensagem = args.slice(1).join(' ');
        saveConfig();
        return msg.reply('💬 Mensagem atualizada:\n*' + config.notifMensagem + '*\n\n' + (config.notifAuto ? '✅ Será usada na próxima notificação.' : 'Use `notifauto on` para ativar.'));
    }

    return msg.reply('❌ Opção inválida.\n\nUse: `notifauto on`, `notifauto off`, `notifauto 3`, `notifauto msg Sua mensagem`');
}

// ========== SERVIDOR HTTP ==========
const app = express();
app.get('/health', (req, res) => res.status(200).json({
    status: 'ok', ready: isReady, timestamp: new Date().toISOString(), uptime: process.uptime()
}));
app.get('/', async (req, res) => {
    if (isReady) return res.send('<h1>✅ WG PREMIAÇÕES - Online</h1>');
    if (currentQR) {
        try {
            const d = await QRCode.toDataURL(currentQR);
            res.send('<html><body style="text-align:center"><h1>📱 WG PREMIAÇÕES</h1><p>Escaneie o QR Code:</p><img src="' + d + '"></body></html>');
        } catch (e) { res.status(500).send('Erro ao gerar QR'); }
    } else { res.send('<h1>⏳ Carregando...</h1>'); }
});
const server = http.createServer(app);
server.listen(PORT, '0.0.0.0', () => logger.info('🌐 HTTP porta:', PORT));

// ========== CLIENTE WHATSAPP ==========
let currentQR = null, isReady = false, isReconnecting = false, client = null;

function createClient() {
    cleanAllLocks();
    return new Client({
        authStrategy: new LocalAuth({ dataPath: AUTH_DIR, clientId: 'muniiz-rifas' }),
        puppeteer: {
            headless: true,
            executablePath: '/usr/bin/chromium',
            args: [
                '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                '--disable-gpu', '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process',
                '--no-first-run', '--disable-extensions', '--disable-default-apps',
                '--single-process', '--disable-background-networking',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows', '--disable-breakpad',
                '--disable-component-extensions-with-background-pages',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees',
                '--disable-ipc-flooding-protection', '--disable-renderer-backgrounding',
                '--force-color-profile=srgb', '--metrics-recording-only'
            ],
            handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false
        },
        restartOnAuthFail: false,
        takeoverOnConflict: true,
        takeoverTimeoutMs: 0,
        qrMaxRetries: 3
    });
}

async function initializeWithRetry() {
    try {
        if (client) { try { await client.destroy(); } catch (e) {} client = null; }
        cleanAllLocks();
        await new Promise(resolve => setTimeout(resolve, 3000));
        cleanAllLocks();
        client = createClient();
        setupClientEvents();
        logger.info('🚀 Inicializando cliente...');
        await client.initialize();
    } catch (error) {
        logger.error('❌ Erro na inicialização: ' + error.message);
        cleanAllLocks();
        if (error.message.includes('already running') || error.message.includes('profile') || error.message.includes('Code: 21')) {
            logger.info('🔄 Erro de lock — tentando novamente em 10s...');
        }
        setTimeout(initializeWithRetry, 10000);
    }
}

function setupClientEvents() {
    client.on('qr', async (qr) => { currentQR = qr; isReady = false; logger.info('📱 QR gerado! Escaneie para conectar.'); });
    client.on('ready', () => {
        isReady = true; currentQR = null; isReconnecting = false;
        logger.info('✅ BOT PRONTO E CONECTADO! v14.0 - Emojis + CancelBanca Fix + NotifAuto Fix');
        logger.info('📣 notifAuto=' + config.notifAuto + ' | notifGrupoId=' + (config.notifGrupoId || 'null'));
        if (config.notifAuto && config.notifGrupoId) {
            logger.info('⏳ Iniciando notificação automática em 8s...');
            setTimeout(iniciarNotifAuto, 8000);
        } else if (config.notifAuto && !config.notifGrupoId) {
            logger.warn('⚠️ notifAuto=true mas notifGrupoId não definido! Use o comando "grupo" no grupo e depois "notifauto on"');
        }
    });
    client.on('authenticated', () => { logger.info('🔐 Autenticado!'); isReconnecting = false; });
    client.on('auth_failure', (m) => {
        logger.error('❌ Falha na autenticação:', m);
        isReady = false;
        // Limpa sessão corrompida para gerar novo QR
        try {
            const sessionPath = path.join(AUTH_DIR, 'session-muniiz-rifas');
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
                logger.info('🗑️  Sessão removida — novo QR será gerado');
            }
        } catch (e) {}
        setTimeout(initializeWithRetry, 5000);
    });
    client.on('disconnected', (r) => {
        logger.info('🔌 Desconectado: ' + r);
        isReady = false;
        pararNotifAuto();
        cleanAllLocks();
        if (!isReconnecting) {
            isReconnecting = true;
            logger.info('🔄 Reconectando em 12s...');
            setTimeout(initializeWithRetry, 12000);
        }
    });

    client.on('message', async msg => {
        try {
            if (msg.fromMe) return;

            const chat = await msg.getChat();
            const body = msg.body ? msg.body.trim() : '';

            // *** NOVO v14.0: Processa mensagens com mídia que tenham caption (legenda) ***
            // Mas ignora mídias sem legenda
            if (msg.hasMedia && !body) return;

            // FIX: Ignorar documentos (PDF, imagens) enviados como comprovante de pagamento
            // Tipos de mídia que NÃO devem ser processados como apostas
            const tiposMidia = ['document', 'image', 'video', 'audio', 'ptt', 'sticker', 'vcard'];
            if (msg.hasMedia && tiposMidia.includes(msg.type)) {
                // Se tiver legenda com comando explícito, processa normalmente
                // Caso contrário, trata como confirmação de pagamento silenciosa
                const legendaLimpa = body.toLowerCase().trim();
                const temComandoExplicito = legendaLimpa.startsWith('banca') || legendaLimpa.startsWith('dezena') ||
                    legendaLimpa.startsWith('cancelar') || legendaLimpa.startsWith('resultado') ||
                    legendaLimpa === 'ok' || legendaLimpa === 'pago' || legendaLimpa === 'paguei';
                if (!temComandoExplicito) {
                    logger.info(`📎 Mídia recebida (${msg.type}) de ${userId} — ignorada para apostas`);
                    return; // Não processa como aposta
                }
            }

            if (!body || body.length < 1) return;

            const userId = msg.author || msg.from;
            const cooldownCheck = checkCooldown(userId, 'global');
            if (!cooldownCheck.allowed) {
                return msg.reply(`⏳ Aguarde ${cooldownCheck.tempoRestante}s antes de enviar outro comando.`);
            }

            const userNumber = getUserNumber(msg);
            const userName = await getContactName(msg);
            const admin = isAdmin(userId);
            // FIX v16.0: split(/\s+/) tolera múltiplos espaços e tabs
            const partes = body.trim().split(/\s+/);
            // FIX: Remove prefixo ! ou / do comando (ex: !all → all, /fechar → fechar)
            const comando = partes[0].toLowerCase().replace(/^[!/]/, '');
            const args = partes.slice(1);
            const rifaInfo = verificarRifaAutomatica();
            const grupoConfig = loadGrupo();
            const isGrupo = chat.isGroup;
            const isPrivate = !isGrupo;

            logger.info(`\n[${new Date().toLocaleTimeString()}] ${userNumber}: "${body.substring(0, 60)}" | Admin: ${admin} | Grupo: ${isGrupo}`);

            if (isPrivate && !admin) {
                const comandosPermitidosPrivado = ['banca','dezena','meus','minhas','ok','pago','paguei','cancelar','minhabanca','meusjogos','pagobanca','meuid','status','ajuda','comandos','help','all','todos','mencionar','notificar','notificartodos','notifauto','abrir','fechar','resultado','reset','iniciar','atualizar','debug','pendentes','aprovar','recusar','valores','total','grupo','addadmin','colocar','colocarbanca','cancelarbanca','cancelar','remover','ban','banir','limparchat','limpar','exportar','adicionar','divulgar','quantidade','qtde','resultados','historico','saiu','deu','sorteio','ganhou'];
                if (!comandosPermitidosPrivado.includes(comando)) {
                    const tentativaAposta = extrairApostasFlexivel(body);
                    if (tentativaAposta.length > 0) {
                        return msg.reply('⚠️ *RIFA SÓ NO GRUPO!*\n\nPara apostar na rifa, participe do grupo.\n\n💡 No privado você pode usar:\n• *banca* - Apostar na banca\n• *dezena* - Apostar em dezenas\n• *meus* - Ver suas apostas\n• *ok* - Confirmar pagamento');
                    }
                    return;
                }
            }

            // ========== IDENTIFICAÇÃO ==========

            if (comando === 'meuid') {
                return msg.reply('🆔 *SEU ID*\n\n`' + userId + '`\n\n📱 Número: ' + userNumber);
            }

            if (comando === 'status') {
                const data = loadData();
                const esgotamento = verificarEsgotamento(data);
                let statusMsg = '📊 *STATUS DA RIFA*\n\n' +
                    `🎲 Rifa: ${data.status.toUpperCase()}\n` +
                    `📊 Bichos: ${esgotamento.esgotados}/${esgotamento.total} esgotados\n` +
                    `📋 Cotas: ${config.cotasPorBicho} por bicho\n` +
                    `👤 Seu ID: \`${userId}\`\n` +
                    `🔑 Admin: ${admin ? '✅ SIM' : '❌ NÃO'}`;
                if (esgotamento.esgotou) statusMsg += '\n\n🔒 *Todos os bichos esgotados!*\nSó banca disponível.';
                return msg.reply(statusMsg);
            }

            if (comando === 'debug' && admin) {
                const data = loadData();
                const banca = loadBanca();
                
                // Se tiver um @ ou número como argumento, mostra info desse usuário
                let targetId = userId;
                let targetInfo = 'Você';
                if (args.length > 0) {
                    const num = args[0].replace(/[^\d]/g, '');
                    if (num.length >= 10) {
                        targetId = num + '@c.us';
                        targetInfo = 'Usuário ' + num;
                    }
                }
                
                const userIdAltDbg = targetId.endsWith('@c.us')
                    ? targetId.replace('@c.us', '@lid')
                    : targetId.replace('@lid', '@c.us');
                const numPuroDbg = targetId.split('@')[0];
                const apostasUsuario = data.apostas.filter(a =>
                    a.userId === targetId ||
                    a.userId === userIdAltDbg ||
                    (a.numeroUsuario && a.numeroUsuario === numPuroDbg)
                );
                const apostasNaoCanceladas = apostasUsuario.filter(a => !a.cancelada);
                const apostasCanceladas = apostasUsuario.filter(a => a.cancelada);
                const apostasPagas = apostasUsuario.filter(a => (a.pago === true || a.pago === 'true') && !a.cancelada);
                const apostasPendentes = apostasUsuario.filter(a => !a.pago && !a.cancelada);
                
                let debugMsg = '🔧 *DEBUG - ' + targetInfo + '*\n\n';
                debugMsg += `👤 User ID: \`${targetId}\`\n\n`;
                debugMsg += `📊 *APOSTAS NA RIFA:*\n`;
                debugMsg += `• Total: ${apostasUsuario.length}\n`;
                debugMsg += `• Ativas: ${apostasNaoCanceladas.length}\n`;
                debugMsg += `• Pagas: ${apostasPagas.length}\n`;
                debugMsg += `• Pendentes: ${apostasPendentes.length}\n`;
                debugMsg += `• Canceladas: ${apostasCanceladas.length}\n\n`;
                
                const pedidosBanca = banca.pendentes.filter(p => p.userId === targetId);
                const aprovadosBanca = banca.aprovados.filter(p => p.userId === targetId);
                debugMsg += `🏦 *BANCA:*\n`;
                debugMsg += `• Pendentes: ${pedidosBanca.length}\n`;
                debugMsg += `• Aprovados: ${aprovadosBanca.length}\n\n`;
                
                debugMsg += `🔑 *SISTEMA:*\n`;
                debugMsg += `Admins: \`${JSON.stringify(config.admins)}\`\n`;
                debugMsg += `Grupo: ${grupoConfig.grupoId || 'Não definido'}\n`;
                debugMsg += `É grupo: ${isGrupo}\n`;
                debugMsg += `Privado: ${isPrivate}\n`;
                debugMsg += `Chat ID: ${chat.id._serialized}\n\n`;
                
                if (apostasUsuario.length > 0) {
                    debugMsg += `📋 *ÚLTIMAS 3 APOSTAS:*\n`;
                    apostasUsuario.slice(-3).forEach((a, i) => {
                        const bichoInfo = BICHOS[a.bicho];
                        debugMsg += `${i + 1}. ${bichoInfo.emoji} ${bichoInfo.nome} ${a.cotas}x - R$ ${a.valorPago.toFixed(2)}`;
                        if (a.cancelada) debugMsg += ' ❌ CANCELADA';
                        else if (a.pago) debugMsg += ' ✅ PAGO';
                        else debugMsg += ' ⏳ PENDENTE';
                        debugMsg += `\n   ID: \`${a.id.substring(0, 8)}...\`\n`;
                    });
                }
                
                return msg.reply(debugMsg);
            }

            // ========== RESULTADO DO SORTEIO ==========

            if (comando === 'resultado' && admin) {
                if (args.length === 0) {
                    return msg.reply(
                        '🏆 *ANUNCIAR RESULTADO*\n\n' +
                        '📝 *Como usar:*\n' +
                        '• `resultado elefante` - Bicho sorteado\n' +
                        '• `resultado vaca` - Bicho sorteado\n' +
                        '• `resultado G12` - Por código\n' +
                        '• `resultado 45` - Por dezena\n\n' +
                        '📋 *Aliases aceitos:*\n' +
                        '• `saiu elefante`\n' +
                        '• `deu leao`\n' +
                        '• `sorteio vaca`\n\n' +
                        '⚠️ Isso notifica TODOS os ganhadores no grupo e no PV!'
                    );
                }

                const textoResultado = args.join(' ');
                const codBicho = encontrarBichoNoTexto(textoResultado);
                if (!codBicho) {
                    const dezMatch = textoResultado.trim().match(/^(\d{2})$/);
                    if (dezMatch) {
                        const dez = dezMatch[1];
                        const codDez = DEZENA_PARA_BICHO[dez];
                        if (codDez) return processarResultado(msg, codDez, dez, userId, chat);
                    }
                    return msg.reply('❌ Bicho não reconhecido: "' + textoResultado + '"\n\nUse o nome do bicho (ex: elefante, vaca, leao) ou código (ex: G12).');
                }
                return processarResultado(msg, codBicho, null, userId, chat);
            }

            if (admin && (comando === 'saiu' || comando === 'deu' || comando === 'sorteio' || comando === 'ganhou')) {
                if (args.length > 0) {
                    const textoResultado = args.join(' ');
                    const codBicho = encontrarBichoNoTexto(textoResultado);
                    if (codBicho) return processarResultado(msg, codBicho, null, userId, chat);
                }
            }

            if ((comando === 'resultados' || comando === 'historico') && admin) {
                return listarResultados(msg, userId);
            }

            // ========== COMANDOS ADMIN ==========

            if (comando === 'reset') {
                if (!admin) return msg.reply('❌ Apenas admin pode resetar!');
                return resetarRifa(msg, userId, chat);
            }

            if (comando === 'iniciar') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return iniciarRifa(msg, args, userId, chat);
            }

            if (comando === 'abrir') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return abrirRifa(msg, userId, chat);
            }

            if (comando === 'fechar') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return fecharRifa(msg, userId);
            }

            if (comando === 'atualizar') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return atualizarRifa(msg, userId, chat);
            }

            if (comando === 'quantidade' || comando === 'qtde') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return definirQuantidade(msg, args, userId);
            }

            if (comando === 'grupo') {
                return definirGrupo(msg, args, userId, chat);
            }

            if (comando === 'addadmin') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return addAdmin(msg, args, userId);
            }

            if (comando === 'colocar') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return colocarApostaManual(msg, args, userId, chat);
            }

            if (comando === 'colocarbanca') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return colocarBancaManual(msg, args, userId, chat);
            }

            if (comando === 'adicionar') {
                if (!admin) return msg.reply('❌ Apenas admin pode usar esse comando!');
                return adicionarEstoque(msg, args, userId, chat);
            }

            if (comando === 'notificar') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                if (args.length > 0 && args[0].toLowerCase() === 'todos') {
                    return notificarTodos(msg, args.slice(1), userId, chat);
                }
                return notificarCliente(msg, args, userId, chat);
            }

            if (comando === 'notificartodos') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return notificarTodos(msg, args, userId, chat);
            }

            if (comando === 'all' || comando === 'todos' || comando === 'mencionar') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return notificarTodos(msg, args, userId, chat);
            }

            if (comando === 'ok' && admin && args.length > 0) {
                return aprovarPedido(msg, args, userId);
            }

            if (comando === 'recusar' && admin) {
                return recusarPedido(msg, args, userId);
            }

            if (comando === 'pendentes') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return listarPendentes(msg, userId);
            }

            // ========== COMANDOS USUÁRIO ==========

            if (comando === 'ajuda' || comando === 'comandos' || comando === 'help') {

                // Divide em 2 mensagens para não cortar pelo WhatsApp
                const ajudaGeral =
                    '📚 *COMANDOS — CLIENTES*\n\n' +
                    '• `disponivel` — Ver bichos disponíveis\n' +
                    '• `meus` — Minhas apostas\n' +
                    '• `ok` / `pago` — Confirmar pagamento\n' +
                    '• `cancelar` — Cancelar aposta\n' +
                    '• `cancelar todos` — Cancelar TODAS as apostas\n' +
                    '• `banca` — Apostar na banca\n' +
                    '• `dezena` — Apostar em dezena\n' +
                    '• `minhabanca` — Ver jogos na banca\n' +
                    '• `pagobanca` — Confirmar pagamento banca\n' +
                    '• `valores` / `total` — Ver valores\n' +
                    '• `status` — Status da rifa\n' +
                    '• `meuid` — Ver meu ID\n\n' +
                    '🐾 *Apostar por emoji:*\n' +
                    '• 🐷7 → porco 7x\n' +
                    '• 🐱🐱🐱 → gato 3x\n' +
                    '• 🐶 → cachorro 1x\n' +
                    '• 🐮5 → vaca 5x';

                const ajudaAdmin =
                    '👑 *COMANDOS — ADMIN*\n\n' +
                    '📊 *Rifa:*\n' +
                    '• `iniciar [horário]` — Nova rifa\n' +
                    '• `reset` — Resetar rifa\n' +
                    '• `abrir` / `fechar` — Controlar rifa\n' +
                    '• `atualizar` — Atualizar lista\n' +
                    '• `quantidade [n]` — Cotas por bicho\n' +
                    '• `resultado [bicho]` — Anunciar sorteio\n' +
                    '• `saiu [bicho]` / `deu [bicho]` — Alias resultado\n' +
                    '• `resultados` — Histórico\n\n' +
                    '🎯 *Apostas manuais:*\n' +
                    '• `colocar` — Aposta manual na rifa\n' +
                    '• `colocarbanca` — Aposta manual na banca\n' +
                    '• `adicionar elefante 2 vaca 1` — Restaura estoque\n' +
                    '• `remover 1 elefante 2 aguia` — Remove bicho do pedido _(responda msg)_\n' +
                    '• `cancelarbanca` — Cancela banca _(responda msg)_\n\n' +
                    '💬 *Notificações:*\n' +
                    '• `notificar` / `notificartodos` — Mencionar clientes\n' +
                    '• `notifauto on/off` — Notificação automática\n\n' +
                    '📣 *Divulgação:*\n' +
                    '• `divulgar link https://...` — Define link do grupo\n' +
                    '• `divulgar iniciar` — Inicia envio de convites\n' +
                    '• `divulgar parar` — Para o envio\n' +
                    '• `divulgar status` — Ver progresso\n' +
                    '• `divulgar limite 20` — Máx por dia\n' +
                    '• `divulgar intervalo 60 120` — Intervalo em segundos\n' +
                    '• `divulgar teste 71999999999` — Testar envio\n' +
                    '• `divulgar limpar` — Zera histórico\n\n' +
                    '🔧 *Grupo:*\n' +
                    '• `grupo` — Definir grupo oficial\n' +
                    '• `addadmin @num` — Add novo admin\n' +
                    '• `ban` — Bane participante _(responda msg ou `ban 71999...`)_\n' +
                    '• `limparchat` — Limpa chat + separador visual\n' +
                    '• `exportar` — Exporta membros do grupo (.vcf sem admins)\n' +
                    '• `exportar lista` — Lista números direto no chat\n\n' +
                    '⚙️ *Sistema:*\n' +
                    '• `ok [id]` / `recusar [id]` — Aprovar/recusar banca\n' +
                    '• `pendentes` — Pedidos pendentes\n' +
                    '• `debug` — Info técnica';

                await msg.reply(ajudaGeral);
                return msg.reply(ajudaAdmin);
            }

            if (comando === 'disponivel' || comando === 'disponiveis' || comando === 'disponível' || comando === 'disponíveis') {
                if (isPrivate) return msg.reply('⚠️ Este comando só funciona no grupo da rifa!');
                const data = loadData();
                return msg.reply(gerarDisponiveis(data, rifaInfo));
            }

            if (comando === 'meus' || comando === 'minhas') {
                return verValores(msg, userId, admin);
            }

            if ((comando === 'ok' || comando === 'pago' || comando === 'paguei') && !(admin && args.length > 0)) {
                return confirmarPagamentoRifa(msg, userId);
            }

            if (comando === 'cancelar') {
                return cancelarAposta(msg, args, userId, admin);
            }

            if (comando === 'cancelarbanca') {
                if (!admin) return msg.reply('❌ Apenas admin pode cancelar pedidos de banca.');
                return cancelarBanca(msg, args, userId, admin);
            }

            // ========== NOVO v17.0: !remover ==========
            if (comando === 'exportar') {
                if (!admin) return msg.reply('❌ Apenas admin pode exportar membros!');
                return exportarMembros(msg, args, userId, chat);
            }

            if (comando === 'divulgar') {
                if (!admin) return msg.reply('❌ Apenas admin pode usar esse comando!');
                return gerenciarDivulgar(msg, args, userId);
            }

            if (comando === 'remover') {
                if (!admin) return msg.reply('❌ Apenas admin pode usar esse comando!');
                return removerBichosCliente(msg, args, userId, chat);
            }

            // ========== NOVO v17.0: !ban ==========
            if (comando === 'ban' || comando === 'banir') {
                if (!admin) return msg.reply('❌ Apenas admin pode banir participantes!');
                return banirParticipante(msg, args, userId, chat);
            }

            // ========== NOVO v17.0: !limparchat ==========
            if (comando === 'limparchat' || comando === 'limpar') {
                if (!admin) return msg.reply('❌ Apenas admin pode limpar o chat!');
                return limparChat(msg, userId, chat);
            }

            if (comando === 'notifauto') {
                if (!admin) return msg.reply('❌ Apenas admin!');
                return configurarNotifAuto(msg, args, userId, chat);
            }

            if (comando === 'banca') {
                return solicitarBanca(msg, args, userId, userName, userNumber, rifaInfo, chat, isPrivate);
            }

            if (comando === 'dezena') {
                return solicitarDezena(msg, args, userId, userName, userNumber, rifaInfo, chat, isPrivate);
            }

            if (comando === 'minhabanca' || comando === 'meusjogos') {
                return verMinhaBanca(msg, userId);
            }

            if (comando === 'pagobanca') {
                return confirmarPagamentoBanca(msg, args, userId);
            }

            if (comando === 'valores' || comando === 'total') {
                return verValores(msg, userId, admin);
            }

            // ========== NOVO v14.0: Detecção de apostas via EMOJI ==========
            // Verifica ANTES do fallback de texto, pois emojis puros não são
            // reconhecidos pelo extrairApostasFlexivel (que opera em texto limpo)
            if (detectarMensagemEmoji(body)) {
                const apostasEmoji = extrairApostasDeEmojis(body);
                if (apostasEmoji.length > 0) {
                    logger.info(`🎨 Apostas via emoji detectadas: ${apostasEmoji.map(a => a.nome + ' ' + a.quantidade + 'x').join(', ')}`);

                    // Verifica se é contexto de banca (mensagem começa com "banca")
                    const primeirasPalavras = body.toLowerCase().trim();
                    if (primeirasPalavras.startsWith('banca')) {
                        return solicitarBanca(msg, apostasEmoji.map(a => a.nome.toLowerCase() + ' ' + a.quantidade).join(' ').split(' '), userId, userName, userNumber, rifaInfo, chat, isPrivate);
                    }

                    // Se tem texto antes dos emojis que indica banca
                    // Ex: "banca 🐷🐷🐷" → vai para banca
                    // Caso contrário vai para rifa
                    const data = loadData();
                    return processarApostaRifa(msg, apostasEmoji, userId, userNumber, userName, data, rifaInfo, chat, isPrivate);
                }
            }

            // ---- Tentativa de Aposta na Rifa via texto ----
            const apostas = extrairApostasFlexivel(body);
            if (apostas.length > 0) {
                const data = loadData();
                if (data.status === 'fechada') {
                    await msg.react('🏦');
                    return msg.reply(
                        '🔒 *RIFA FECHADA!* 🔒\n\nTodos os bichos foram vendidos.\n\n💡 *Use a BANCA:*\n' +
                        'banca ' + apostas.map(a => a.nome.toLowerCase() + ' ' + a.quantidade).join(' ') +
                        '\n\n💰 R$ 0,25 → R$ 5,00\n⏰ Funciona 24 horas!'
                    );
                }
                return processarApostaRifa(msg, apostas, userId, userNumber, userName, data, rifaInfo, chat, isPrivate);
            }

            logger.info('❓ Comando não reconhecido ou não é aposta');

        } catch (e) {
            logger.error('❌ Erro no handler:', e);
            try { await msg.reply('❌ Ocorreu um erro. Tente novamente.'); } catch (e2) {}
        }
    });
}

// ========== INICIALIZAÇÃO ==========
logger.info('🚀 Iniciando MUNIIZ RIFAS BOT v17.0...');
logger.info('🌍 Timezone: America/Sao_Paulo');
logger.info('📅 Data/Hora: ' + getDataHoraAtual().toLocaleString('pt-BR'));
logger.info('✅ FIX v17.0: lookupEmoji() - todos emojis detectados (fix variation selector \\uFE0F)');
logger.info('✅ NOVO v17.0: !remover - remove bichos específicos sem cancelar pedido inteiro');
logger.info('✅ NOVO v17.0: !ban - bane participante por resposta ou número');
logger.info('✅ NOVO v17.0: !limparchat - limpa chat e envia separador visual');

ensureDirectories();
loadConfig();
initializeWithRetry();
