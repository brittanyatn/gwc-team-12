//(ginny) added this on 11/6, this is for the quiz!
import React from 'react';

export default function QuizQuestion({ data, currentIndex, total, onSelect, onSkip }) {
  if (!data) return null; // Safe guard against undefined data

  return (
    <div className="quiz-card">
      <div className="quiz-header">
        <span className="step-counter">Question {currentIndex + 1} of {total}</span>
        <button type="button" className="skip-link" onClick={() => onSkip('lightForest')}>
          Skip
        </button>
      </div>      

      <h3 className="question-title">{data.question}</h3>

      <div className="option-stack">
        {data.options.map((option, idx) => (
          <button
            key={idx}
            type="button"
            className="option-card"
            onClick={() => onSelect(option)}
          >
            {option.text}
          </button>
        ))}
      </div>
    </div>
  );
}