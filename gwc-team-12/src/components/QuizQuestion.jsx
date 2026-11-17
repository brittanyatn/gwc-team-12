//(ginny) added this on 11/6, this is for the quiz!
// Restyled to match the Figma "Quiz Q1–Q5" frames.
import React, { useState } from 'react';
import ForestCard from './ForestCard';

export default function QuizQuestion({ data, currentIndex, total, onSelect, onSkip, theme }) {
  const [selectedIdx, setSelectedIdx] = useState(null);

  if (!data) return null; // Safe guard against undefined data

  const choose = (option, idx) => {
    if (selectedIdx !== null) return; // ignore double clicks while advancing
    setSelectedIdx(idx);
    // brief pause so the "selected" state from the design is visible
    setTimeout(() => {
      setSelectedIdx(null);
      onSelect(option);
    }, 250);
  };

  return (
    <ForestCard theme={theme} className="quiz-card-forest">
      <div className="quiz-header-forest">
        <span className="quiz-counter">Question {currentIndex + 1} of {total}</span>
        <div className="quiz-header-right">
          <div className="quiz-steps" aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} className={`quiz-step ${i <= currentIndex ? 'is-done' : ''}`} />
            ))}
          </div>
          <button type="button" className="forest-link" onClick={() => onSkip('lightForest')}>
            Skip
          </button>
        </div>
      </div>

      <h3 className="quiz-question-forest">{data.question}</h3>

      <div className="quiz-answers">
        {data.options.map((option, idx) => (
          <button
            key={idx}
            type="button"
            className={`quiz-answer ${selectedIdx === idx ? 'is-selected' : ''}`}
            onClick={() => choose(option, idx)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </ForestCard>
  );
}
