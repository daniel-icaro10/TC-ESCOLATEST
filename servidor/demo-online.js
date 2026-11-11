#!/usr/bin/env node
/*
 * Demonstração online (Render): sobe a catraca SIMULADA e o sistema no mesmo processo,
 * com dados fictícios só na memória. Nada aqui fala com uma catraca de verdade.
 *
 *   node servidor/demo-online.js      (o Render define PORT)
 */
'use strict';
process.env.CONFIG = process.env.CONFIG || 'config.online.json';
require('./simulador.js');
require('./server.js');
