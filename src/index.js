import Tone from 'tone';
import { Note, Distance } from 'tonal';
import samples from './samples';

const getPitchShiftedSampler = (instrumentName, changeInSemitones = 0) =>
  new Promise(resolve => {
    const disposableNodes = [];
    const disposeNode = node => {
      node.dispose();
      const i = disposableNodes.findIndex(n => n === node);
      if (i >= 0) {
        disposableNodes.splice(i, 1);
      }
    };
    const instrumentSamples = samples[instrumentName];
    const findClosest = note => {
      const noteMidi = Note.midi(note);
      const maxInterval = 96;
      let interval = 0;
      while (interval <= maxInterval) {
        const higherNote = Note.fromMidi(noteMidi + interval);
        if (instrumentSamples[higherNote]) {
          return higherNote;
        }
        const lowerNote = Note.fromMidi(noteMidi - interval);
        if (instrumentSamples[lowerNote]) {
          return lowerNote;
        }
        interval += 1;
      }
      return note;
    };
    let destination;
    const buffers = new Tone.Buffers(instrumentSamples, {
      baseUrl: `./samples/${instrumentName}/`,
      onload: () => {
        resolve({
          triggerAttack: (note, time) => {
            const closestSample = findClosest(note);
            const difference = Distance.semitones(note, closestSample);
            const bufferSource = new Tone.BufferSource(
              buffers.get(closestSample)
            ).connect(destination);
            const playbackRate = Tone.intervalToFrequencyRatio(
              -difference + changeInSemitones
            );
            bufferSource.set({
              playbackRate,
              onended: () => disposeNode(bufferSource),
              fadeIn: 3,
              fadeOut: 3,
            });
            disposableNodes.push(bufferSource);
            bufferSource.start(time);
          },
          connect: node => {
            destination = node;
          },
          dispose: () => {
            buffers.dispose();
            disposableNodes.forEach(node => node.dispose());
          },
        });
      },
    });
  });

const getBuffers = instrumentName =>
  new Promise(resolve => {
    const buffers = new Tone.Buffers(samples[instrumentName], {
      baseUrl: `./samples/${instrumentName}/`,
      onload: () => resolve(buffers),
    });
  });

const NOTES = ['C4', 'E4', 'F4', 'G4', 'B5', 'A5'];
const PITCH_CHANGES = [-36, -24];

Promise.all([
  Promise.all(
    NOTES.reduce(
      samplers =>
        samplers.concat(
          PITCH_CHANGES.map(change =>
            getPitchShiftedSampler('vcsl-wine-glasses-slow', change)
          )
        ),
      []
    )
  ),
  getBuffers('vcsl-claves'),
]).then(([wines, claves]) => {
  const disposableNodes = [];
  const disposeNode = node => {
    node.dispose();
    const i = disposableNodes.findIndex(n => n === node);
    if (i >= 0) {
      disposableNodes.splice(i, 1);
    }
  };
  const compressor = new Tone.Compressor().toMaster();
  const filter = new Tone.Filter(1000);
  filter.connect(compressor);
  const startDelays = wines.map(() => Math.random() * 60);
  const minStartDelay = Math.min(...startDelays);
  wines.forEach((wine, i) => {
    const vol = new Tone.Volume().connect(filter);
    const lfo = new Tone.LFO({
      min: -500,
      max: 30,
      frequency: Math.random() / 100,
      phase: Math.random() * 360,
    });
    lfo.connect(vol.volume).start();
    wine.connect(vol);
    const playNote = () => {
      wine.triggerAttack(NOTES[i], '+1');
      Tone.Transport.scheduleOnce(() => {
        playNote();
      }, '+60');
    };
    Tone.Transport.scheduleOnce(() => {
      playNote();
    }, `+${startDelays[i] - minStartDelay + 1}`);
  });

  const claveSounds = samples['vsco2-claves'];
  const delay = new Tone.FeedbackDelay({
    delayTime: 3,
    feedback: 0.3,
    wet: 0.2,
  }).toMaster();
  const reverb = new Tone.Freeverb({ roomSize: 0.6, wet: 1 }).connect(delay);
  const ballBounceClave = () => {
    const panner = new Tone.Panner(Math.random() * 2 - 1).connect(reverb);
    disposableNodes.push(panner);
    const buffer = claves.get(Math.floor(Math.random() * claveSounds.length));
    let time = Math.random() + 1;
    const deltaMultiplier = Math.random() * 0.1 + 0.75;
    const playbackRate = Math.random() + 0.5;
    for (
      let delayDelta = 1;
      delayDelta >= (1 - deltaMultiplier - 0.15) / 10;
      delayDelta *= deltaMultiplier, time += delayDelta
    ) {
      const source = new Tone.BufferSource(buffer)
        .set({ playbackRate, volume: -35, onended: () => disposeNode(source) })
        .connect(panner);
      disposableNodes.push(source);
      source.start(`+${time}`);
    }
    Tone.Transport.scheduleOnce(() => {
      disposeNode(panner);
    }, `+60`);
    Tone.Transport.scheduleOnce(() => {
      ballBounceClave();
    }, `+${Math.random() * 10 + 10}`);
  };
  Tone.Transport.scheduleOnce(() => {
    ballBounceClave();
  }, `+${Math.random() * 10 + 10}`);

  Tone.Transport.start();

  return () => {
    disposableNodes.forEach(node => disposeNode(node));
    [wines, claves, compressor, filter, delay, reverb].forEach(node =>
      node.dispose()
    );
  };
});
