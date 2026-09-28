'use client';

import { useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { Container } from '@/landing/Container';
import { basePath } from '@/lib/site';

export function Film() {
  let ref = useRef<HTMLVideoElement>(null);
  let isInView = useInView(ref, { amount: 0.3 });
  let [paused, setPaused] = useState(false);
  let [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  useEffect(() => {
    let video = ref.current;
    if (!video) return;
    video.muted = true;
    if (isInView && !paused && !reducedMotion) video.play().catch(() => {});
    else video.pause();
  }, [isInView, paused, reducedMotion]);

  return (
    <section id="film" aria-label="Status Original in 37 seconds" className="pb-20 sm:pb-32">
      <Container>
        <div className="relative mx-auto max-w-sm sm:max-w-5xl">
          <video
            ref={ref}
            muted
            loop
            playsInline
            controls={reducedMotion}
            preload="metadata"
            poster={`${basePath}/promo/film-poster.jpg`}
            aria-label="Your account is twelve words, five protocols share one chat list, and an AI agent pays a friend back while you approve on your phone."
            className="aspect-9/16 w-full rounded-3xl object-cover shadow-xl ring-1 shadow-gray-900/10 ring-gray-900/5 sm:aspect-video">
            <source
              media="(max-width: 639px)"
              src={`${basePath}/promo/film-9x16.mp4`}
              type="video/mp4"
            />
            <source src={`${basePath}/promo/film-16x9.mp4`} type="video/mp4" />
          </video>
          {!reducedMotion && (
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              aria-label={paused ? 'Play the video' : 'Pause the video'}
              className="absolute right-4 bottom-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md ring-1 ring-gray-900/10 backdrop-blur hover:bg-white">
              <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
                {paused ? (
                  <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" />
                ) : (
                  <path d="M4 3h3v10H4zM9 3h3v10H9z" />
                )}
              </svg>
            </button>
          )}
        </div>
      </Container>
    </section>
  );
}
