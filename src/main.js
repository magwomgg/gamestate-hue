import bodyParser from 'body-parser';
import { diff } from 'deep-object-diff';
import flat from 'flat';
import { EventEmitter } from 'events';
import createDebug from 'debug';
import fetch from 'node-fetch';

const HEADSHOT_LIGHT = "1";
const A_LIGHT = "41";
const B_LIGHT = "45";
const MID_LIGHT = "46";
const UNDER_LIGHT = "55";

const LIGHTS = {
    HEADSHOT_LIGHT: HEADSHOT_LIGHT,
    A_LIGHT: A_LIGHT,
    B_LIGHT: B_LIGHT,
    MID_LIGHT: MID_LIGHT,
    UNDER_LIGHT: UNDER_LIGHT
};

const CT = { on: true, bri: 255, ct: 500, xy: [0.1, 0.1], transitiontime: 10 };
const T = { on: true, bri: 255, ct: 500, xy: [0.5, 0.5], transitiontime: 10 };
const FIRE_COLOR = { on: true, bri: 255, ct: 500, xy: [0.6, 0.4] };
const EXPLOSION_COLOR= { on: true, bri: 255, ct: 500, xy: [0.5, 0.4] };
const FLASH_COLOR = { on: true, bri: 255, ct: 500, xy: [0.3, 0.3], bri: 255 };
const BLOOD_COLOR = { on: true, bri: 255, ct: 500, xy: [0.7, 0.3] };
const MONEY_COLOR = { on: true, bri: 255, ct: 500, xy: [0.1, 0.8] };

const TEAM_COLORS = { CT, T };

const OFF = { on: false };

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
    
    await hue({ 
        A_LIGHT: OFF,
        B_LIGHT: OFF,
        MID_LIGHT: OFF,
        UNDER_LIGHT: OFF,
        HEADSHOT_LIGHT: OFF
    });

    emitter.on('round.bomb', async bomb => {
        switch(bomb) {
            case 'exploded':
                await hue({ 
                    A_LIGHT: EXPLOSION_COLOR,
                    B_LIGHT: EXPLOSION_COLOR,
                    MID_LIGHT: EXPLOSION_COLOR,
                    UNDER_LIGHT: EXPLOSION_COLOR,
                    HEADSHOT_LIGHT: EXPLOSION_COLOR
                });
        }
    });

    emitter.on('player.state.round_kills', async (kills, gamestate) => {
        if (kills > 0) {
            await hue({
                UNDER_LIGHT: BLOOD_COLOR
            });

            await delay(2000);

            await hue({
                UNDER_LIGHT: OFF
            });
        }
    });

    
    emitter.on('player.state.round_killhs', async headshots => {
        if (headshots > 0) {
            await hue({
                HEADSHOT_LIGHT: BLOOD_COLOR
            });

            await delay(2000);

            await hue({
                HEADSHOT_LIGHT: OFF
            });
        }
    });


    emitter.on('player.state.flashed', async (flashed, gamestate) => {
        if (flashed === 255) {
            await hue({ 
                A_LIGHT: FLASH_COLOR,
                B_LIGHT: FLASH_COLOR,
                MID_LIGHT: FLASH_COLOR,
                UNDER_LIGHT: FLASH_COLOR,
                HEADSHOT_LIGHT: FLASH_COLOR
            });

            await delay(1000);

            await hue({ 
                A_LIGHT: TEAM_COLORS[gamestate.player.team],
                B_LIGHT: TEAM_COLORS[gamestate.player.team],
                MID_LIGHT: TEAM_COLORS[gamestate.player.team],
                UNDER_LIGHT: OFF,
                HEADSHOT_LIGHT: OFF
            });
        }
    });

    emitter.on('player.state.smoked', async (smoked, gamestate) => {
        if (smoked === 255) {
            await hue({ 
                A_LIGHT: OFF,
                B_LIGHT: OFF,
                MID_LIGHT: OFF,
                UNDER_LIGHT: OFF,
                HEADSHOT_LIGHT: OFF
            });
         } else if (smoked === 0) {
            await hue({
                A_LIGHT: TEAM_COLORS[gamestate.player.team],
                B_LIGHT: TEAM_COLORS[gamestate.player.team],
                MID_LIGHT: TEAM_COLORS[gamestate.player.team]
            });
        }
    });

    emitter.on('player.state.burning', async (burning) => {
        if (burning === 255) {
            await hue({
                UNDER_LIGHT: FIRE_COLOR
            });
        } else if (burning === 0) {
            await hue({
                UNDER_LIGHT: OFF
            });
        }
    });

    emitter.on('player.state.health', async (health) => {
        if (health === 0) {
            await hue({ 
                A_LIGHT: BLOOD_COLOR,
                B_LIGHT: BLOOD_COLOR,
                MID_LIGHT: BLOOD_COLOR,
                UNDER_LIGHT: BLOOD_COLOR,
                HEADSHOT_LIGHT: BLOOD_COLOR
            });

        } else if (health < 100) {
            await hue({ 
                UNDER_LIGHT: BLOOD_COLOR,
            });
            await delay(500);
            await hue({ 
                UNDER_LIGHT: OFF,
            });
        }
    });

    emitter.on('map', async map => {
        if (map === undefined) {
            await hue({ 
                A_LIGHT: OFF,
                B_LIGHT: OFF,
                MID_LIGHT: OFF,
                UNDER_LIGHT: OFF,
                HEADSHOT_LIGHT: OFF
            });
        }
    });

    emitter.on('round.phase', async (phase, gamestate) => {
        switch (phase) {
            case 'freezetime':
            case 'live':
                await hue({ 
                    A_LIGHT: TEAM_COLORS[gamestate.player.team],
                    B_LIGHT: TEAM_COLORS[gamestate.player.team],
                    MID_LIGHT: TEAM_COLORS[gamestate.player.team],
                    UNDER_LIGHT: OFF,
                    HEADSHOT_LIGHT: { ...MONEY_COLOR, bri: Math.round(Math.min(gamestate.player.state.money * 255 / 4000, 255)) }
                });

                await delay(4000);

                await hue({ 
                    HEADSHOT_LIGHT: OFF
                });
        }
    });

    async function hue(lights = {}) {
        return Promise.all(Object.entries(lights).map(([lightName, state]) => {
            const lightId = LIGHTS[lightName];
            const url = new URL(`lights/${lightId}/state`, config.hue.baseUrl).toString();
            const init = {
                method: 'PUT',
                body: JSON.stringify(state)
            };
    
            debug('light: #%s: %o', lightId, state);
    
            return fetch(url, init);
        }));
    }

    async function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
