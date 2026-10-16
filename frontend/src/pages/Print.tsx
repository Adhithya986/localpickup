import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";

function Print() {
  const navigate = useNavigate();
  const location = useLocation();
  const shopData = location.state || { shopId: "1", shopName: "ABC Digital Prints" };

  const [file, setFile] = useState<File | null>(null);
  const [paper, setPaper] = useState<"A4" | "A3">("A4");
  const [colour, setColour] = useState<"bw" | "colour">("bw");
  const [sides, setSides] = useState<"single" | "double">("single");
  const [copies, setCopies] = useState(1);
  const [binding, setBinding] = useState(false);
  const [lamination, setLamination] = useState(false);

  const basePrice = paper === "A4" ? 2 : 4;
  const colourPrice = colour === "colour" ? 3 : 0;
  const doubleSideDiscount = sides === "double" ? 1 : 0;

  const printingPrice =
    Math.max(
      1,
      basePrice + colourPrice - doubleSideDiscount
    ) * copies;

  const bindingPrice = binding ? 20 : 0;
  const laminationPrice = lamination ? 10 : 0;

  const total =
    printingPrice +
    bindingPrice +
    laminationPrice;

  function handleFileChange(
    event: React.ChangeEvent<HTMLInputElement>
  ) {
    const selectedFile = event.target.files?.[0];

    if (selectedFile) {
      setFile(selectedFile);
    }
  }

  function increaseCopies() {
    setCopies((current) => current + 1);
  }

  function decreaseCopies() {
    setCopies((current) =>
      Math.max(1, current - 1)
    );
  }

  function continueToPickup() {
    navigate("/pickup", {
      state: {
        shopId: shopData.shopId,
        shopName: shopData.shopName,
        file,
        fileName: file?.name,
        paper,
        colour,
        sides,
        copies,
        binding,
        lamination,
        total,
      },
    });
  }

  return (
    <div className="app">
      <Navbar />

      <main>
        <section className="print-header">
          <Link
            to="/shops/1"
            className="back-link"
          >
            ← Back to shop
          </Link>

          <p className="eyebrow">
            DOCUMENT PRINTING
          </p>

          <h1>Configure your print</h1>

          <p className="hero-description">
            Upload your document and choose how
            you'd like it printed.
          </p>
        </section>

        <section className="print-layout">
          <div className="print-form">

            {/* Upload */}

            <div className="form-section">
              <h2>1. Upload document</h2>

              {!file ? (
                <label className="upload-box">
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                    hidden
                  />

                  <div className="upload-icon">
                    📄
                  </div>

                  <strong>
                    Click to upload your document
                  </strong>

                  <span>
                    PDF, DOC, DOCX, JPG or PNG
                  </span>
                </label>
              ) : (
                <div className="selected-file">
                  <div className="file-icon">
                    📄
                  </div>

                  <div>
                    <strong>{file.name}</strong>

                    <p>
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="remove-file"
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            {/* Paper */}

            <div className="form-section">
              <h2>2. Paper size</h2>

              <div className="option-grid">
                <button
                  className={`option ${
                    paper === "A4"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => setPaper("A4")}
                >
                  <strong>A4</strong>
                  <span>Standard document</span>
                </button>

                <button
                  className={`option ${
                    paper === "A3"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => setPaper("A3")}
                >
                  <strong>A3</strong>
                  <span>Large format</span>
                </button>
              </div>
            </div>

            {/* Colour */}

            <div className="form-section">
              <h2>3. Colour</h2>

              <div className="option-grid">
                <button
                  className={`option ${
                    colour === "bw"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() => setColour("bw")}
                >
                  <strong>Black & White</strong>
                  <span>Standard printing</span>
                </button>

                <button
                  className={`option ${
                    colour === "colour"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setColour("colour")
                  }
                >
                  <strong>Colour</strong>
                  <span>Full colour printing</span>
                </button>
              </div>
            </div>

            {/* Sides */}

            <div className="form-section">
              <h2>4. Printing sides</h2>

              <div className="option-grid">
                <button
                  className={`option ${
                    sides === "single"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSides("single")
                  }
                >
                  <strong>Single-sided</strong>
                  <span>Print on one side</span>
                </button>

                <button
                  className={`option ${
                    sides === "double"
                      ? "selected"
                      : ""
                  }`}
                  onClick={() =>
                    setSides("double")
                  }
                >
                  <strong>Double-sided</strong>
                  <span>Print on both sides</span>
                </button>
              </div>
            </div>

            {/* Copies */}

            <div className="form-section">
              <h2>5. Copies</h2>

              <div className="copies-control">
                <button
                  onClick={decreaseCopies}
                >
                  −
                </button>

                <strong>{copies}</strong>

                <button
                  onClick={increaseCopies}
                >
                  +
                </button>
              </div>
            </div>

            {/* Optional */}

            <div className="form-section">
              <h2>6. Optional services</h2>

              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={binding}
                  onChange={(event) =>
                    setBinding(
                      event.target.checked
                    )
                  }
                />

                <span>
                  <strong>Spiral Binding</strong>
                  <small>+ ₹20</small>
                </span>
              </label>

              <label className="checkbox-option">
                <input
                  type="checkbox"
                  checked={lamination}
                  onChange={(event) =>
                    setLamination(
                      event.target.checked
                    )
                  }
                />

                <span>
                  <strong>Lamination</strong>
                  <small>+ ₹10</small>
                </span>
              </label>
            </div>
          </div>

          {/* Summary */}

          <aside className="price-summary">
            <h2>Order summary</h2>

            <div className="summary-shop">
              <span>Shop</span>
              <strong>ABC Digital Prints</strong>
            </div>

            <div className="summary-line">
              <span>Printing</span>
              <span>₹{printingPrice}</span>
            </div>

            {binding && (
              <div className="summary-line">
                <span>Binding</span>
                <span>₹20</span>
              </div>
            )}

            {lamination && (
              <div className="summary-line">
                <span>Lamination</span>
                <span>₹10</span>
              </div>
            )}

            <div className="summary-divider" />

            <div className="summary-total">
              <span>Estimated total</span>
              <strong>₹{total}</strong>
            </div>

            <button
              className="continue-button"
              disabled={!file}
              onClick={continueToPickup}
            >
              Continue to pickup →
            </button>

            {!file && (
              <p className="helper-text">
                Upload a document to continue.
              </p>
            )}
          </aside>
        </section>
      </main>
    </div>
  );
}

export default Print;