import React from "react";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span>📖 ADVENTURER'S SURVIVAL GUIDE</span>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body help-content">
          <p>
            Welcome to the <strong>Zork Trilogy</strong>. You interact with the world by typing English commands and pressing Enter.
          </p>

          <table className="help-table">
            <thead>
              <tr>
                <th>Category</th>
                <th>Commands & Examples</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Movement</strong></td>
                <td>
                  <code>NORTH (N)</code>, <code>SOUTH (S)</code>, <code>EAST (E)</code>, <code>WEST (W)</code>, 
                  <code>NE</code>, <code>NW</code>, <code>SE</code>, <code>SW</code>, <code>UP (U)</code>, <code>DOWN (D)</code>, 
                  <code>ENTER</code>, <code>EXIT</code>
                </td>
              </tr>
              <tr>
                <td><strong>Inspection</strong></td>
                <td>
                  <code>LOOK (L)</code> - Describe current room<br />
                  <code>EXAMINE &lt;item&gt;</code> - Inspect an object in detail<br />
                  <code>INVENTORY (I)</code> - List items carried<br />
                  <code>READ &lt;item&gt;</code> - Read a book, leaflet, or sign
                </td>
              </tr>
              <tr>
                <td><strong>Interaction</strong></td>
                <td>
                  <code>TAKE &lt;item&gt;</code> / <code>DROP &lt;item&gt;</code><br />
                  <code>OPEN &lt;container&gt;</code> / <code>CLOSE &lt;container&gt;</code><br />
                  <code>PUT &lt;item&gt; IN &lt;container&gt;</code><br />
                  <code>TURN ON LANTERN</code> / <code>LIGHT MATCH</code><br />
                  <code>ATTACK &lt;monster&gt; WITH &lt;weapon&gt;</code>
                </td>
              </tr>
              <tr>
                <td><strong>Game Control</strong></td>
                <td>
                  <code>SAVE</code> / <code>RESTORE</code> - In-game save & load<br />
                  <code>SCORE</code> - View your current points and rank<br />
                  <code>DIAGNOSE</code> - Check your physical condition<br />
                  <code>WAIT (Z)</code> - Pass time in place<br />
                  <code>MENU</code> - Return to game selection menu
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ background: "rgba(20, 50, 20, 0.4)", padding: "10px", borderLeft: "3px solid var(--phosphor-bright)" }}>
            <strong style={{ color: "var(--phosphor-bright)" }}>⚠️ Adventurer's Wisdom:</strong>
            <ul style={{ paddingLeft: "20px", marginTop: "6px", fontSize: "16px" }}>
              <li>Never wander into dark caves without a lighted lantern or torch, or you are likely to be eaten by a <em>grue</em>.</li>
              <li>Your game progress is automatically saved to your Root OS profile after every single move!</li>
              <li>You can also create named save checkpoints using the <code>[SAVE SLOTS]</code> button.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
