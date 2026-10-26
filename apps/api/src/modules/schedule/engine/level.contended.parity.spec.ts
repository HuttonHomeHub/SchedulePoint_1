import { scaleSpec } from '@repo/seed';
import { describe, expect, it } from 'vitest';

import { digest, levelled, randomPlan } from '../../../../test/legacy-levelling/random-plan';
import { specToEngineInput } from '../../../../test/pairwise/spec-to-engine';

import { computeSchedule } from './compute';
import { levelSchedule } from './level';
import type { EngineAssignment } from './types';
import type { WorkingTimeCalendar } from './working-time-calendar';

/**
 * **Contended-resource levelling answers exactly what it answered before #84's speed-up.**
 *
 * `docs/TECH_DEBT.md` #84 removed the quadratic term in one crew carrying thousands of activities:
 * the profile steps over whole blocks of events, and the candidate search drops gaps too short to hold
 * the run. Both are only valid if they move no date, so this runs the WHOLE pass on seeded random plans
 * and holds the output to the SHA-256 of `JSON.stringify` of the engine as it stood before the change
 * (commit 2a7f213a): every field of every result, and the summary.
 *
 * The plans are small enough to read and varied enough to reach the branches the speed-up touches — one
 * hot resource and several, capacities above and below one, fractional demands (0.1 is not a whole
 * multiple of 2⁻¹⁶, so those plans take the unchanged path), per-assignment lags, per-activity
 * calendars with weekends and a shift calendar (so a gap can be long in minutes and short in working
 * time), milestones, priorities, links with and without Pass C, and both float modes. A hash that stops
 * matching means levelling's OUTPUT moved. If the generator is changed on purpose, regenerate the hashes
 * from a tree that still has the old engine, never from the one under test.
 *
 * **Seeds 12, 52 and 57 were regenerated on purpose by #539 M2 (ADR-0207 D1)**, which stops snapping a
 * zero-span activity onto its own calendar. The evidence is `docs/specs/milestone-cross-calendar/
 * levelling-hash-evidence.md`, produced by `scripts/measure-milestone-levelling-movement.mts` against the
 * parent engine: of the 60 seeds exactly these three differ. Seeds 12 and 52 each hold a start milestone on
 * its own calendar beside plan-calendar activities (a seam, the case the change is for): its late offsets,
 * its predecessor's float and the levelled starts that float bounds move. Seed 57 has no seam and moves
 * only in-memory instants. No row without a seam moved a reported field.
 */

const FROZEN: Record<number, string> = {
  1: '29a18db3f4002900c0400ef66bab9f59dc447a0d269bab2568788a6afbabe8fe',
  2: 'baf76a357739ae66070098cfe165edfc9412eee9a11497de50088c7606bdac85',
  3: '837572364d1fa42c05533ab732e5f495cf6113a285a8f7c817ed1800b430e6c4',
  4: 'ad2c63fa8ee6adcb21b6aecfd98fcf7f9ba7bfff452bc8aa11fe4360eb4a3c09',
  5: 'eaf6d8085d732aac4188c1238558a4f2d8b28a1c14ef490b9c4c9efabfc07ed2',
  6: 'ec7d0dc30af4a813c32a24ad922a8ceaabb4d9dfed66ad651efb8c57ba173ad7',
  7: 'a4c60144985dc084348f2c47b00ac3a2c6ad7edf465fc4fe0db6c6d1cad9452f',
  8: 'a643cae99eea334b495159e94c86df691b07256237b9eb0784ab32e4e7237861',
  9: '48947b7ac772ba4b23d2ee682f794cd0e1730f6fbc17e2aec049fa6fb48a7756',
  10: '1558b38e4768c14f3dc2682d364e4f495ce4490c3c7ed60fd65bfbfd34654f74',
  11: 'a31ac874cd53e50abe18c5a1491c49f840bcd494a4940c97e1e3974f7f5bfb63',
  12: '8ab14bea932f5a6aa241b79d6a7865a533941000ad7fe3ebd4095fee447cccde',
  13: '9172a8be552bb406387e1cd3e2356d29b7329f6daa8c66e1a927cb912fd3d847',
  14: 'f822d192c6941abbc82d69295788b150fec1de4f2ae3e3aef94cfffbae6d8440',
  15: '901f8273207571388d31f6a015199a82a09113ce763ea1b006ea82734ecc7a19',
  16: '15a1ae945ed4b0720c05b17927b80873d4a3dc22e595e5721e8b05c986c346be',
  17: '1d72131b5eb973d97a46f706b4cce61c3c57a12b7f17b5d6ff6e6077ce941b1d',
  18: '1b2ef10100086ae84685fcf038ded6c9847d7efb30d4ab140a7554b409d13ead',
  19: '97546e99d7d0203fc25ec36a63dd501de506a100b014b515ba995438e0afce40',
  20: '0aa70388a6045bfb36f0367a31c79a0712b0ae11b1d0061b536163fcec494305',
  21: '04912ebf44f8295d885fead2d449bf0101722741e9a6010053e411d215dfec3a',
  22: 'f965f7d0cfc31f06d924357b8a7fab89a89936dc4ecc1cd9eaba152bf42ccd58',
  23: '27210fd9d11ccdd62670f6613005699cdc680d9e37fc14a4c2fe3368f8f57ffd',
  24: 'a785cfc579d74398c8ea323c60f3430d7123f34860392b899d049334612a5c38',
  25: 'c8c8a116785acc9c7194084ac306b92713ec96b9ca65989db63ee0c082933030',
  26: '84a1bfdb510f887c3abbf13fbc02b5f8520a1f6557247eb3d609afc8562b94d9',
  27: '66e30721b969adef258cb7febb12d0e50ee7fcae4ed7552b689ceca5910c24a9',
  28: '736192e9b554298780deed64bcf7643a30f501125be367dd0a41dfe1336c51a3',
  29: '14cb216104c53339fd4ef3c9b22cc6946b0e0510c59054d8ed3511a93568ae98',
  30: 'd0a9938d6d16458f74e2b3e77f12bcc2a90bb3ecf1546686a9801574b1989fcd',
  31: '06312f7a705066414ba81fd7b154a222612ba8dfbc9807d313f88e7aa771dff8',
  32: 'c546248fb2fc8aa0f4f4b37062db43a8dbf26b254e9e30ccd27443cb20dc32d6',
  33: 'ce8224a5699a8b8dfdb4dcf7eca67107b894f7bf676fd4a5086695188f9ca203',
  34: '1b8714608c41b94b7a907e5f59bf2652aacc9cd1dd1107321b71e87da8a0680e',
  35: '4297c8f9c77fe4d95b79dab59e20c05d191a3aebe6cd10ee6cbb5afbd19a2340',
  36: '45474875058a4915610d512ddd8321a57051a79212cb5247b560b4a3eca54c57',
  37: '6c3c4c6e0fa825ecd75339ceca118e747d1a4ffd8d8434bc12d357eee9273724',
  38: '5fe11ed682074818c1b5136006bcc49707b8787f2e40d443d0f0329c4dee61e9',
  39: '806e65b6e9c0d44cc8a25d37d4e0d4de822721261df34066cab28c532be7070b',
  40: '4f1ee0e8e8108423db9a0e10bd9a2f63f5eff5fde36b5d2778933c80a9dae372',
  41: '01c8e8fdd6b4d36bf718cc9b52ac50b0b54d2e3e8eaffec32648e604bab4be50',
  42: 'ae0caa8734afb4aec505360666b7e092fffd0e87602f25a33ec25b9df4c7c92d',
  43: '7b9e9b8bd41d3f4878f611023075e2d5ad9febfa1459392a72a088d19bd949e4',
  44: '0869fa4ac31b17839a93ff306da627db12e31619cdfc52dbf3c8cca3bca8b62d',
  45: '6a30ce87edd0ae4c36e8387d7ae6a30e176bc179df858f4893845637924f8e74',
  46: '041cfeef8da3b0f427554fd86eec43833d3155250415c59d2a4e28842e011d75',
  47: 'e26f70046bd7c2463ec87b9421128e8c432c8fc27c7d902f98746f61e3ca44a4',
  48: '85896dbcf947368e2261b8aa46e1011817e7accd37c1da3bbab68a96c5b77b03',
  49: 'd6a125d2d0ad662084c1de5e86e29974381cdbe90b5dd6a3776e29bd942a62cd',
  50: 'fadc4f61fc4a563cac6bfcb69b9f180a852fbe4f7f2f143ccaf8eda5f962081e',
  51: '3d10bda559bc2fe2f020da8ce5b774aae7876e06724a0e02fb5142b7193ae2c1',
  52: 'acbfbc127b477388123ebf29c4934e2f61cf9c6f8c7a756e24d582c84c255cff',
  53: '36af82514ae69bb9a7a1b97761f35bc7e0222528dc510d0e31b37ef106d1338a',
  54: '24e488356da02cb3af3820c5e39ab79055b9475afb0d3ce75d50b5eafc608512',
  55: 'fba3322379608889167c4368c3f77a4b8f9afc4f4c2dab6134ccd8f77e1025f9',
  56: '7770ac76621f6b5d4c8f3cb5fb82e5bb8d57fce4fe94ea1859f6f28cfb2d4e22',
  57: '881affe0074f94ad43e5d33ab585455cf8b38db2d724aff4aa2ca40c5e41e26c',
  58: 'e5010e5ebc4ee5ee065854900686be59026d1af01d737383dc95548e7c623a94',
  59: '65c2ad3854c32290688905d8fa23bfdd0877650df2022ac90f37f9a785753900',
  60: '81a19855cbaafafcaa960b7e5f9661a6f6fadf23eb10caa5e5803a1c2c983468',
};

describe('levelSchedule — contended-resource output is byte-identical to before #84', () => {
  for (const seed of Object.keys(FROZEN).map(Number)) {
    it(`seed ${seed}`, () => {
      expect(digest(levelled(randomPlan(seed), levelSchedule))).toBe(FROZEN[seed]);
    });
  }

  it('has the frozen corpus it claims', () => {
    expect(Object.keys(FROZEN)).toHaveLength(60);
  });
});

describe('levelSchedule — one crew carrying a whole plan does not scale with the square (#84)', () => {
  /**
   * Calendar calls are the work the old pass multiplied: every too-short gap it tested cost three
   * walks of the calendar. Counting them is deterministic where a stopwatch is not.
   */
  const levelOneCrew = (activityCount: number): { level: () => number } => {
    const { activities, edges, options } = specToEngineInput(
      scaleSpec({ activities: activityCount }),
    );
    const network = computeSchedule(activities, edges, options);
    const crew: EngineAssignment[] = activities
      .filter(
        (a) => a.durationMinutes > 0 && a.type !== 'WBS_SUMMARY' && a.type !== 'LEVEL_OF_EFFORT',
      )
      .map((a) => ({ activityId: a.id, resourceId: 'CREW', unitsPerHour: 1 }));
    let calls = 0;
    const counting: WorkingTimeCalendar = {
      addWorkingTime: (from, minutes) => {
        calls += 1;
        return options.calendar.addWorkingTime(from, minutes);
      },
      workingTimeBetween: (from, to) => {
        calls += 1;
        return options.calendar.workingTimeBetween(from, to);
      },
    };
    // One calendar object across every `level()` call: anything remembered per calendar by a module
    // rather than by the pass would show up as the second call doing less work.
    return {
      level: () => {
        calls = 0;
        levelSchedule(activities, network, [], crew, [{ id: 'CREW', capacity: 1 }], {
          levelWithinFloatOnly: false,
          dataDate: options.dataDate,
          planCalendar: counting,
          anchor: 'PLACED',
        });
        return calls;
      },
    };
  };

  it('keeps the calendar work for 4,000 activities far under a quadratic count', () => {
    const small = levelOneCrew(2000).level();
    const large = levelOneCrew(4000).level();
    // Counted 2026-10-17: 35,315 and 71,037 now (a ratio of 2.01); 1,183,266 and 4,550,616 on the
    // engine before the speed-up (3.85). The bounds sit a factor of five from the first and a factor
    // of eleven from the second.
    expect(large).toBeLessThan(400_000);
    expect(large / small).toBeLessThan(2.5);
  }, 60_000);

  it('remembers nothing between passes: a second pass on the same calendar does the same work', () => {
    const crew = levelOneCrew(1000);
    const first = crew.level();
    const second = crew.level();
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
  }, 60_000);
});
