//(ginny) added on 11/6, these are the quiz questions :3
import React, { useState } from 'react';
import QuizQuestion from './QuizQuestion';

const QUIZ_DATA = [
  {
    id: 1,
    question: "A hidden path opens in the woods. What draws you in?",
    options: [
      { text: "Sunlit rustling leaves", light: 2, dark: 0 },
      { text: "A faint, mysterious glow", light: 0, dark: 2 },
      { text: "A distant trickling stream", light: 1, dark: 1 },
    ]
  },
  {
    id: 2,
    question: "A forest guide appears. Who steps out?",
    options: [
      { text: "A wise barn owl", light: 2, dark: 0 },
      { text: "A shadowy silver fox", light: 0, dark: 2 },
      { text: "A quiet misty deer", light: 1, dark: 1 },
    ]
  },
  {
    id: 3,
    question: "Which trail do you follow?",
    options: [
      { text: "The sunlit wildflower path", light: 2, dark: 0 },
      { text: "The glowing mushroom trail", light: 0, dark: 2 },
      { text: "Mossy stone steps", light: 1, dark: 1 },
    ]
  },
  {
    id: 4,
    question: "What sound fits your mood right now?",
    options: [
      { text: "Warm acoustic & breezy strings", light: 2, dark: 0 },
      { text: "Deep bass & driving beats", light: 0, dark: 2 },
      { text: "Dreamy lo-fi & ambient pads", light: 1, dark: 1 },
    ]
  },
  {
    id: 5,
    question: "At the forest's heart, which relic do you take?",
    options: [
      { text: "A warm sunstone crystal", light: 2, dark: 0 },
      { text: "A silver-laced obsidian charm", light: 0, dark: 2 },
      { text: "A firefly glass lantern", light: 1, dark: 1 },
    ]
  }
];

export default function OnboardingQuiz({ onComplete }) {
  const [screen, setScreen] = useState('welcome');
  const [questionIdx, setQuestionIdx] = useState(0);
  const [tally, setTally] = useState({ lightForest: 0, darkForest: 0 });
  const [selectedTheme, setSelectedTheme] = useState('lightForest');

  const handleOptionChoice = (selectedOption) => {
    const nextTally = {
      lightForest: tally.lightForest + selectedOption.light,
      darkForest: tally.darkForest + selectedOption.dark,
    };
    setTally(nextTally);

    if (questionIdx + 1 < QUIZ_DATA.length) {
      setQuestionIdx(questionIdx + 1);
    } else {
      const winner = nextTally.darkForest > nextTally.lightForest ? 'darkForest' : 'lightForest';
      setSelectedTheme(winner);
      setScreen('reveal');
    }
  };

  const handleSkip = (theme = 'lightForest') => {
    onComplete(theme);
  };

  if (screen === 'welcome') {
    return (
      <div className="quiz-card welcome-card">
        <h2 className="brand-title">Enchanted Grove</h2>
        <p className="brand-tagline">Tune your environment before you hit play.</p>
        <button type="button" className="btn-primary" onClick={() => setScreen('quiz')}>
          Take the Quiz
        </button>
        <div className="skip-actions">
          <button type="button" className="skip-link" onClick={() => handleSkip('lightForest')}>
            Skip to Light Forest
          </button>
          <span className="divider">•</span>
          <button type="button" className="skip-link" onClick={() => handleSkip('darkForest')}>
            Skip to Dark Forest
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'reveal') {
    return (
      <div className="quiz-card reveal-card">
        <span className="badge">Attunement Chosen</span>
        <h2 className="brand-title">
          {selectedTheme === 'lightForest' ? 'Sunlit Canopy' : 'Moonlit Glade'}
        </h2>
        <p className="brand-tagline">
          Theme assigned: <strong>{selectedTheme}</strong>
        </p>
        <button type="button" className="btn-primary" onClick={() => onComplete(selectedTheme)}>
          DJ Spin That Shit
        </button>
      </div>
    );
  }

  return (
    <QuizQuestion
      data={QUIZ_DATA[questionIdx]}
      currentIndex={questionIdx}
      total={QUIZ_DATA.length}
      onSelect={handleOptionChoice}
      onSkip={handleSkip}
    />
  );
}