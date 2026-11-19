//(ginny) added on 11/6, these are the quiz questions :3
import React, { useState } from 'react';
import QuizQuestion from './QuizQuestion';
import ForestCard, { useSystemForestTheme } from './ForestCard';
import { playDjSpin } from '../lib/sfx';
import { demoMode, setDemoMode } from '../lib/backupPlaylists';

// `genres` = Spotify genre names each answer adds to the forest mix (see src/lib/forestMix.js).
// Each option's genres echo its own imagery; overlap between questions is kept low so
// no genre piles up just from picking "middle" answers. Q4 (`weight: 2`) counts double.
// Q4's `sound` also picks the backup playlist (see src/lib/backupPlaylists.js).
const QUIZ_DATA = [
  {
    id: 1,
    question: "A hidden path opens in the woods. What draws you in?",
    options: [
      { text: "Sunlit rustling leaves", light: 2, dark: 0, genres: ["indie folk", "folk pop"] },
      { text: "A faint, mysterious glow", light: 0, dark: 2, genres: ["dream pop", "shoegaze"] },
      { text: "A distant trickling stream", light: 1, dark: 1, genres: ["ambient", "lo-fi"] },
    ]
  },
  {
    id: 2,
    question: "A forest guide appears. Who steps out?",
    options: [
      { text: "A wise barn owl", light: 2, dark: 0, genres: ["singer-songwriter", "chamber folk"] },
      { text: "A shadowy silver fox", light: 0, dark: 2, genres: ["trip hop", "alternative r&b"] },
      { text: "A quiet misty deer", light: 1, dark: 1, genres: ["bedroom pop", "chillwave"] },
    ]
  },
  {
    id: 3,
    question: "Which trail do you follow?",
    options: [
      { text: "The sunlit wildflower path", light: 2, dark: 0, genres: ["indie pop", "sunshine pop"] },
      { text: "The glowing mushroom trail", light: 0, dark: 2, genres: ["psychedelic rock", "neo-psychedelic"] },
      { text: "Mossy stone steps", light: 1, dark: 1, genres: ["jazz", "neo soul"] },
    ]
  },
  {
    id: 4,
    question: "What sound fits your mood right now?",
    options: [
      { text: "Warm acoustic & breezy strings", sound: "acoustic", light: 2, dark: 0, weight: 2, genres: ["acoustic", "folk"] },
      { text: "Deep bass & driving beats", sound: "beats", light: 0, dark: 2, weight: 2, genres: ["electronic", "house", "hip hop"] },
      { text: "Dreamy lo-fi & ambient pads", sound: "dreamy", light: 1, dark: 1, weight: 2, genres: ["lo-fi", "ambient"] },
    ]
  },
  {
    id: 5,
    question: "At the forest's heart, which relic do you take?",
    options: [
      { text: "A warm sunstone crystal", light: 2, dark: 0, genres: ["soul", "funk"] },
      { text: "A silver-laced obsidian charm", light: 0, dark: 2, genres: ["darkwave", "post-punk"] },
      { text: "A firefly glass lantern", light: 1, dark: 1, genres: ["bossa nova", "chamber pop"] },
    ]
  },
  {
    id: 6,
    // `discover` = share of the mix that's new-to-you songs (0 = all favourites, 1 = all new)
    question: "A traveler offers you a map. Where do you go?",
    options: [
      { text: "The paths I already know", light: 1, dark: 1, discover: 0.15 },
      { text: "A little off the trail", light: 1, dark: 1, discover: 0.4 },
      { text: "Deep into uncharted woods", light: 1, dark: 1, discover: 0.7 },
    ]
  }
];

// "Demo mode" switch on the welcome screen: on = the hand-picked playlists play,
// off = the forest mix is built from the listener's Spotify (see backupPlaylists.js).
function DemoToggle() {
  const [on, setOn] = useState(demoMode);
  const flip = () => { setDemoMode(!on); setOn(!on); };
  return (
    <button
      type="button"
      className={`demo-toggle ${on ? 'is-on' : ''}`}
      role="switch"
      aria-checked={on}
      onClick={flip}
      title={on ? 'Plays the hand-picked playlist for your mood answer' : 'Builds a forest mix from your Spotify (uses Spotify search)'}
    >
      <span className="demo-toggle-track"><span className="demo-toggle-knob" /></span>
      {on ? 'Demo mode: curated playlists' : 'Demo mode off: forest mix'}
    </button>
  );
}

export default function OnboardingQuiz({ onComplete }) {
  const [screen, setScreen] = useState('welcome');
  const systemTheme = useSystemForestTheme();
  const [questionIdx, setQuestionIdx] = useState(0);
  const [tally, setTally] = useState({ lightForest: 0, darkForest: 0 });
  const [selectedTheme, setSelectedTheme] = useState('lightForest');
  const [answers, setAnswers] = useState([]); // picked options, used to build the playlist

  const handleOptionChoice = (selectedOption) => {
    const nextTally = {
      lightForest: tally.lightForest + selectedOption.light,
      darkForest: tally.darkForest + selectedOption.dark,
    };
    setTally(nextTally);
    const nextAnswers = [...answers, selectedOption];
    setAnswers(nextAnswers);

    if (questionIdx + 1 < QUIZ_DATA.length) {
      setQuestionIdx(questionIdx + 1);
    } else {
      const winner = nextTally.darkForest > nextTally.lightForest ? 'darkForest' : 'lightForest';
      setSelectedTheme(winner);
      setScreen('reveal');
    }
  };

  // Back: undo the most recent answer and return to that question
  const handleBack = () => {
    if (screen === 'quiz' && questionIdx === 0) {
      setScreen('welcome');
      return;
    }
    const last = answers[answers.length - 1];
    if (last) {
      setTally({
        lightForest: tally.lightForest - last.light,
        darkForest: tally.darkForest - last.dark,
      });
      setAnswers(answers.slice(0, -1));
    }
    setQuestionIdx(Math.max(answers.length - 1, 0));
    setScreen('quiz');
  };

  const handleSkip = (theme = 'lightForest') => {
    onComplete(theme, answers); // skipped: mix uses the theme + any answers so far
  };

  if (screen === 'welcome') {
    // Not in Figma yet — styled to match the "Connect to Spotify" frame
    return (
      <ForestCard theme={systemTheme} className="welcome-card-forest">
        <p className="forest-title">Enchanted Grove</p>
        <p className="forest-body">Tune your environment before you hit play.</p>
        <div className="forest-spacer" style={{ height: 14 }} />
        <button type="button" className="btn-forest" onClick={() => setScreen('quiz')}>
          Take the Quiz
        </button>
        <div className="forest-spacer" style={{ height: 6 }} />
        <div className="skip-row">
          <button type="button" className="forest-link" onClick={() => handleSkip('lightForest')}>
            Skip to Light Forest
          </button>
          <span className="divider">•</span>
          <button type="button" className="forest-link" onClick={() => handleSkip('darkForest')}>
            Skip to Dark Forest
          </button>
        </div>
        <div className="forest-spacer" style={{ height: 12 }} />
        <DemoToggle />
        <div className="forest-spacer" style={{ height: 12 }} />
      </ForestCard>
    );
  }

  if (screen === 'reveal') {
    // "Pre-results" frame — shown in the theme the quiz picked
    return (
      <ForestCard theme={selectedTheme} className="results-card">
        <button type="button" className="forest-link forest-back" onClick={handleBack}>
          ‹ Back
        </button>
        <p className="forest-kicker">Attunement Chosen</p>
        <p className="results-title">The forest has decided…</p>
        <p className="results-mix">
          Your mix: {selectedTheme === 'lightForest' ? 'Sunlit Canopy' : 'Moonlit Glade'}
        </p>
        <p className="forest-kicker">Theme assigned: {selectedTheme}</p>
        <div className="forest-spacer" style={{ height: 18 }} />
        <button type="button" className="btn-forest" onClick={() => { playDjSpin(); onComplete(selectedTheme, answers); }}>
          DJ spin that
        </button>
      </ForestCard>
    );
  }

  return (
    <QuizQuestion
      key={questionIdx}
      data={QUIZ_DATA[questionIdx]}
      currentIndex={questionIdx}
      total={QUIZ_DATA.length}
      onSelect={handleOptionChoice}
      onSkip={handleSkip}
      onBack={handleBack}
      theme={systemTheme}
    />
  );
}