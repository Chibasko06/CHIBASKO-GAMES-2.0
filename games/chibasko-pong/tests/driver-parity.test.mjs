import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocalPongRuntime } from '../dist/local/localRuntime.js';
import { pongServerModule } from '@chibaskogames/chibasko-pong/server';
import { createPongModel, PONG } from '@chibaskogames/chibasko-pong/shared';
const participants = ['left', 'right'].map(participantId => ({ participantId, username: participantId, avatarUrl: null }));
function online() {
    const results = [];
    const platform = { session: { id: 'session', gameId: 'chibasko-pong', integrationVersion: 1, execution: 'online' },
        participants, isParticipantActive: () => true, complete(result) { results.push(result); return true; }, fail() { throw new Error('Unexpected failure'); } };
    const game = pongServerModule.create(platform);
    participants.forEach(p => game.participantJoined(p));
    game.start();
    return { game, results };
}
test('local browser driver and online authoritative driver stay identical over two complete matches', () => {
    const local = createLocalPongRuntime(), keys = Object.keys(createPongModel());
    for (let round = 0; round < 2; round++) {
        if (round)
            local.restart();
        const { game, results } = online();
        const phases = new Set();
        // Hold opposite extremes. No timing, physics or scoring shortcuts in either driver.
        for (let i = 0; i < 2; i++) {
            local.setInput(i === 0 ? 'LEFT' : 'RIGHT', i === 0 ? -1 : 1);
            game.receive({ participant: participants[i], reply() { } }, 'set_input', { direction: i === 0 ? -1 : 1 });
        }
        for (let tick = 0; tick < 20000 && local.getFrame().current.phase !== 'FINISHED'; tick++) {
            const delta = tick % 3 === 0 ? 20 : 40;
            local.advance(delta, tick * 33);
            game.tick(delta);
            const view = local.getFrame().current;
            for (const key of keys)
                assert.equal(view[key], game.state[key], `round ${round}, tick ${tick}, ${key}`);
            phases.add(view.phase);
        }
        assert.equal(local.getFrame().current.phase, 'FINISHED');
        assert.equal(Math.max(game.state.leftScore, game.state.rightScore), PONG.winningScore);
        assert.deepEqual([...phases], ['COUNTDOWN', 'PLAYING', 'POINT_PAUSE', 'FINISHED']);
        assert.equal(results.length, 1);
        game.dispose();
    }
    local.dispose();
});
