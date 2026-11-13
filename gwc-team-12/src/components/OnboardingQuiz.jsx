//(ginny) added on 11/6, these are the quiz questions :3
import React, { useState } from 'react';
import QuizQuestion from './QuizQuestion';

const QUIZ_DATA = [
  {
    id: 1,
    question: "You stumble upon a hidden path in the forest. What calls to you first?",
    options: [
      { text: "The sound of rustling leaves", theme: "lightForest" },
      { text: "A mysterious glowing light", theme: "darkForest" },
    ]
  },
  {
    id: 2,
    question: "A woodland guide steps forward from the trees. Who is it?",
    options: [
      { text: "A wise old owl", theme: "lightForest" },
      { text: "A shadowy fox", theme: "darkForest" },
    ]
  },
  {
    id: 3,
    question: "You find a clearing with two paths. Which do you take?",
    options: [
      { text: "The sunlit path with flowers", theme: "lightForest" },
      { text: "The misty path with glowing mushrooms", theme: "darkForest" },
    ]
  },
  {
    id: 4,
    question: "What music matches your state of mind right now?",
    options: [
      { text: "Soft acoustic melodies, warm strings, and breezy rhythms", theme: "lightForest" },
      { text: "Energetic beats, deep bass, and driving melodies", theme: "darkForest" },
    ]
  },
  {
    id: 5,
    question: "At the heart of the woods, you are drawn to an offering:",
    options: [
      { text: "A sunstone crystal set into pale birch that radiates warmth.", theme: "lightForest" },
      { text: "An obsidian pendulum laced with silver ivy that hums quietly.", theme: "darkForest" },
    ]
  }
];

export default function OnboardingQuiz({ onComplete }) {
  const [screen, setScreen] = useState('welcome');
  const [questionIdx, setQuestionIdx] = useState(0);
  const [tally, setTally] = useState({ lightForest: 0, darkForest: 0 });
  const [selectedTheme, setSelectedTheme] = useState('lightForest'); // 1. Added missing state hook

  const handleOptionChoice = (themeKey) => {
    const nextTally = { ...tally, [themeKey]: tally[themeKey] + 1 };
    setTally(nextTally);

    if (questionIdx + 1 < QUIZ_DATA.length) {
      setQuestionIdx(questionIdx + 1);
    } else {
      const winner = nextTally.darkForest > nextTally.lightForest ? 'darkForest' : 'lightForest';
      setSelectedTheme(winner);
      setScreen('reveal'); // 2. Fixed from 'result' to 'reveal' to match your if-condition below
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