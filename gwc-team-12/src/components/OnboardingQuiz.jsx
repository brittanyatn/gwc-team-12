//(ginny) added on 11/6, these are the quiz questions :3
import React, { useState } from 'react';
import QuizQuestion from './QuizQuestion';
import ForestCard, { useSystemForestTheme } from './ForestCard';

// `genres` = Spotify genre keywords each answer adds to the forest mix (see src/lib/forestMix.js)
const QUIZ_DATA = [
  {
    id: 1,
    question: "A hidden path opens in the woods. What draws you in?",
    options: [
      { text: "Sunlit rustling leaves", light: 2, dark: 0, genres: ["indie folk", "folk", "acoustic"] },
      { text: "A faint, mysterious glow", light: 0, dark: 2, genres: ["dream pop", "synth", "darkwave"] },
      { text: "A distant trickling stream", light: 1, dark: 1, genres: ["lo-fi", "chill", "ambient"] },
    ]
  },
  {
    id: 2,
    question: "A forest guide appears. Who steps out?",
    options: [
      { text: "A wise barn owl", light: 2, dark: 0, genres: ["singer-songwriter", "folk"] },
      { text: "A shadowy silver fox", light: 0, dark: 2, genres: ["alternative", "trip hop", "indie rock"] },
      { text: "A quiet misty deer", light: 1, dark: 1, genres: ["dream pop", "bedroom pop"] },
    ]
  },
  {
    id: 3,
    question: "Which trail do you follow?",
    options: [
      { text: "The sunlit wildflower path", light: 2, dark: 0, genres: ["indie pop", "pop"] },
      { text: "The glowing mushroom trail", light: 0, dark: 2, genres: ["electronic", "psychedelic"] },
      { text: "Mossy stone steps", light: 1, dark: 1, genres: ["lo-fi", "jazz"] },
    ]
  },
  {
    id: 4,
    question: "What sound fits your mood right now?",
    options: [
      { text: "Warm acoustic & breezy strings", light: 2, dark: 0, genres: ["acoustic", "folk", "singer-songwriter"] },
      { text: "Deep bass & driving beats", light: 0, dark: 2, genres: ["electronic", "house", "hip hop", "techno"] },
      { text: "Dreamy lo-fi & ambient pads", light: 1, dark: 1, genres: ["lo-fi", "ambient", "chill"] },
    ]
  },
  {
    id: 5,
    question: "At the forest's heart, which relic do you take?",
    options: [
      { text: "A warm sunstone crystal", light: 2, dark: 0, genres: ["soul", "indie pop"] },
      { text: "A silver-laced obsidian charm", light: 0, dark: 2, genres: ["post-punk", "darkwave", "alternative"] },
      { text: "A firefly glass lantern", light: 1, dark: 1, genres: ["jazz", "bossa nova", "chill"] },
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
        <div className="forest-spacer" style={{ height: 30 }} />
      </ForestCard>
    );
  }

  if (screen === 'reveal') {
    // "Pre-results" frame — shown in the theme the quiz picked
    return (
      <ForestCard theme={selectedTheme} className="results-card">
        <p className="forest-kicker">Attunement Chosen</p>
        <p className="results-title">The forest has decided…</p>
        <p className="results-mix">
          Your mix: {selectedTheme === 'lightForest' ? 'Sunlit Canopy' : 'Moonlit Glade'}
        </p>
        <p className="forest-kicker">Theme assigned: {selectedTheme}</p>
        <div className="forest-spacer" style={{ height: 18 }} />
        <button type="button" className="btn-forest" onClick={() => onComplete(selectedTheme, answers)}>
          DJ spin that shit
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
      theme={systemTheme}
    />
  );
}