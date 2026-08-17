import { Link } from 'react-router-dom';
import { CinemaStage } from './cinema';
import { btnMarquee, marqueeGlow, marqueePanel, marqueePill } from './ui';

export function Home() {
  return (
    <CinemaStage>
      <div className={marqueePanel} style={marqueeGlow}>
        <p className={marqueePill}>Em cartaz</p>
        <h1 className="m-0 max-w-[14ch] text-[clamp(2.1rem,6vw,3.6rem)] font-extrabold tracking-tight text-white">
          O cartaz abre em breve
        </h1>
        <Link className={btnMarquee} to="/login">
          Entrar
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </CinemaStage>
  );
}
