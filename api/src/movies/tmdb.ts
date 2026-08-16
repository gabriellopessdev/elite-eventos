const TMDB_SEARCH = 'https://api.themoviedb.org/3/search/movie';

export class TmdbConfigError extends Error {
  constructor() {
    super('TMDB_API_KEY is not set');
    this.name = 'TmdbConfigError';
  }
}

export class TmdbUpstreamError extends Error {
  constructor(readonly status: number) {
    super(`TMDb upstream error (${status})`);
    this.name = 'TmdbUpstreamError';
  }
}

export type MovieHit = {
  tmdbId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string | null;
};

type TmdbSearchBody = {
  results?: Array<{
    id: number;
    title?: string;
    poster_path?: string | null;
    release_date?: string;
  }>;
};

export async function searchMovies(query: string): Promise<MovieHit[]> {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    throw new TmdbConfigError();
  }

  const url = new URL(TMDB_SEARCH);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('include_adult', 'false');
  url.searchParams.set('language', 'pt-BR');

  const res = await fetch(url);
  if (!res.ok) {
    throw new TmdbUpstreamError(res.status);
  }

  const body = (await res.json()) as TmdbSearchBody;
  return (body.results ?? []).map((row) => ({
    tmdbId: row.id,
    title: row.title ?? '',
    posterPath: row.poster_path ?? null,
    releaseDate: row.release_date || null,
  }));
}
