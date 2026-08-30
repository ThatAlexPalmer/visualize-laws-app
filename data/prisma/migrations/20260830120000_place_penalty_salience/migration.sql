-- Average problem salience inside the model-read set, split by whether the
-- section names a dollar amount.
--
-- This is the measurable link between the fines layer and the four scoring
-- axes. Corpus-wide: sections that name an amount average +1.166 problem
-- salience, sections the model read but that name none average +0.361, and
-- sections nobody read average -0.373. Both stored columns come from inside
-- the read set, so the gap between them is not a sampling artifact.
--
-- Stored per place rather than shown as one national constant: the cards
-- beside it are scope-specific, so a fixed figure would misread as local.

ALTER TABLE "place_penalties"
    ADD COLUMN "salience_amount" DOUBLE PRECISION,
    ADD COLUMN "salience_no_amount" DOUBLE PRECISION;
