// Attribution constants for the LOCUS-v1 corpus, shared by the About page.

// Announcement tweet/X URL — set via NEXT_PUBLIC_TWEET_URL (optional).
export const TWEET_URL = process.env.NEXT_PUBLIC_TWEET_URL || "";
export const PAPER_URL = "https://arxiv.org/abs/2606.19334";
export const DATASET_URL = "https://huggingface.co/LocalLaws";

export const BIBTEX = `@article{peskoff2026freeing,
  title={Freeing the Law with LOCUS: A Local Ordinance Corpus for the United States},
  author={Peskoff, Denis and Barrow, Joe and Vu, Christopher and Davenport, Diag},
  journal={arXiv preprint arXiv:2606.19334},
  year={2026}
}`;
