#!/usr/bin/env node
/*
 * Demonstração online (Render): sobe a catraca SIMULADA e a ponte no mesmo processo.
 * O portal fica no endereço do serviço e o cliente testa tudo pelo navegador dele,
 * inclusive a foto pela webcam. Nada aqui fala com uma catraca de verdade.
 *
 *   node ponte-catraca/demo-online.js      (o Render define PORT)
 */
'use strict';
process.env.PONTE_CONFIG = process.env.PONTE_CONFIG || 'config.online.json';
require('./simulador.js');
require('./server.js');
