import bodyParser from 'body-parser';
import { diff } from 'deep-object-diff';
import flat from 'flat';
import { EventEmitter } from 'events';
import createDebug from 'debug';
import fetch from 'node-fetch';

const lights = [1, 55];

export default async function main({ config, express, ws }) {
    const debug = createDebug('gamestate');

    const gamestates = {};
    const emitter = new EventEmitter();

    express.app.use(bodyParser.json());

    express.app.post('/', (req, res) => {
        const { body } = req;

        const { player, map, round } = body;

        if (!body.player) {
            return res.end();
        }

        const playerId = body.player.steamid;

        const oldGameState = gamestates[playerId];
        const gameState = { player, map, round };

        gamestates[playerId] = gameState;

        const gameStateDiff = flat(diff(oldGameState, gameState));

        for (const key in gameStateDiff) {
            const value = gameStateDiff[key];
            
            debug('%s = %o', key, value);

            emitter.emit(key, value, gameState);
        }
    
        ws.server.clients.forEach(function each(client) {
            if (client.readyState === 1) {
                client.send(JSON.stringify(body, null, 4));
            }
        });
    
        res.end();
    });
    
    await off(1);
    await off(55);

    emitter.on('round.bomb', async bomb => {
        switch(bomb) {
            case 'exploded':
                await on(1, colors.BOOM);
                await on(55, colors.BOOM);
        }
    });

    emitter.on('player.state.round_kills', async (kills, gamestate) => {
        if (kills > 0) {
            await on(55, colors.BLOOD);
            await delay(2000);
            await on(55, colors[gamestate.player.team]);
        }
    });

    
    emitter.on('player.state.round_killhs', async headshots => {
        if (headshots > 0) {
            await on(1, colors.BLOOD);
            await delay(2000);
            await off(1);
        }
    });


    emitter.on('player.state.flashed', async (flashed, gamestate) => {
        if (flashed === 255) {
            await on(1, { ...colors.LIGHT, bri: flashed });
            await on(55, { ...colors.LIGHT, bri: flashed });
            await delay(1000);
            await off(1, { transitiontime: 20 });
            await on(55, { transitiontime: 20, ...colors[gamestate.player.team] });
        }
    });

    emitter.on('player.state.burning', async (burning, gamestate) => {
        if (burning === 255) {
            await on(55, { ...colors.FIRE, bri: burning });
        } else if (burning === 0) {
            await on(55, colors[gamestate.player.team]);
        }
    });

    emitter.on('player.state.health', async (health) => {
        if (health === 0) {
            await on(1, colors.BLOOD);
            await on(55, colors.BLOOD);
        } else if (health < 100) {
            await on(1, colors.BLOOD);
            await delay(500);
            await off(1);
        }
    });

    emitter.on('map', async map => {
        if (map === undefined) {
            await off(1);
            await off(55);
        }
    });

    emitter.on('round.phase', async (phase, gamestate) => {
        switch (phase) {
            case 'freezetime':
                await on(55, colors[gamestate.player.team]);    
                await on(1, { ...colors.MONEY, bri: Math.round(Math.min(gamestate.player.state.money * 255 / 4000, 255)) });
                await delay(4000);
                await off(1);
        }
    });
        
    async function on(lightId, state) {
        return hue(lightId, { transitiontime: 0, ...state, on: true });
    }

    async function off(lightId, state) {
        return hue(lightId, { transitiontime: 0, ...state, on: false });
    }

    async function hue(lightId, state) {
        const url = new URL(`lights/${lightId}/state`, config.hue.baseUrl).toString();
        const init = {
            method: 'PUT',
            body: JSON.stringify(state)
        };

        debug('light: #%s: %o', lightId, state);

        return fetch(url, init);
    }

    async function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    const colors = {
        CT: { bri: 127, ct: 500, xy: [0.1, 0.1], transitiontime: 10 },
        T: { bri: 127, ct: 500, xy: [0.5, 0.5], transitiontime: 10 },
        FIRE: { bri: 255, ct: 500, xy: [0.6, 0.4] },
        BOOM: { bri: 255, ct: 500, xy: [0.5, 0.4] },
        LIGHT: { bri: 255, ct: 500, xy: [0.3, 0.3] },
        BLOOD: { bri: 255, ct: 500, xy: [0.7, 0.3] },
        MONEY: { bri: 255, ct: 500, xy: [0.1, 0.8] },
    }
}
