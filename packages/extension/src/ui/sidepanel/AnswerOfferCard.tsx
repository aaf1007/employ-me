import type { PanelController } from '../../sidepanel/controller';
import type { AnswerOfferState } from '../../sidepanel/state';

/**
 * Once the Application is created: "Save N answers you typed or changed for
 * next time?" Each answer has its own checkbox, unticked (design.md
 * "Keeping answers you gave on the form").
 */
export function AnswerOfferCard({
  offer,
  controller,
  openSavedAnswers,
}: {
  readonly offer: AnswerOfferState;
  readonly controller: PanelController;
  readonly openSavedAnswers: () => void;
}) {
  switch (offer.state) {
    case 'none':
    case 'closed':
      return null;
    case 'saved':
      return (
        <div className="success" role="status" data-testid="answer-offer-saved">
          <strong>
            {offer.count === 1 ? 'Kept 1 Saved Answer.' : `Kept ${String(offer.count)} Saved Answers.`}
          </strong>
          <p className="small">Later Fills use them when a form asks the same question.</p>
          <div className="row">
            <button type="button" onClick={openSavedAnswers}>
              Open Saved Answers
            </button>
          </div>
        </div>
      );
    case 'open': {
      const count = offer.answers.length;
      const ticked = offer.ticked.length;
      return (
        <section className="card" aria-labelledby="answer-offer-title" data-testid="answer-offer">
          <strong id="answer-offer-title">
            {count === 1
              ? 'Save 1 answer you typed or changed for next time?'
              : `Save ${String(count)} answers you typed or changed for next time?`}
          </strong>
          <p className="small muted">Tick the ones to keep as Saved Answers. They stay on this computer.</p>
          <ul className="offered">
            {offer.answers.map((answer) => (
              <li key={answer.key} data-testid="offered-answer">
                <label>
                  <input
                    type="checkbox"
                    checked={offer.ticked.includes(answer.key)}
                    disabled={offer.saving}
                    onChange={() => {
                      controller.answerOffer.toggle(answer.key);
                    }}
                  />{' '}
                  <span className="field-label">{answer.question}</span>
                </label>
                <span className="small" data-testid="offered-answer-value">
                  {answer.answer}
                </span>
                {answer.previous === undefined ? null : (
                  <span className="small muted" data-testid="offered-answer-previous">
                    Updates your Saved Answer: {answer.previous}
                  </span>
                )}
              </li>
            ))}
          </ul>
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={ticked === 0 || offer.saving}
              onClick={() => void controller.answerOffer.save()}
            >
              {ticked === 1 ? 'Save 1 answer' : `Save ${String(ticked)} answers`}
            </button>
            <button
              type="button"
              disabled={offer.saving}
              onClick={() => {
                controller.answerOffer.close();
              }}
            >
              Not now
            </button>
          </div>
        </section>
      );
    }
  }
}
