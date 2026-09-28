'use client';

import clsx from 'clsx';
import { useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { basePath } from '@/lib/site';

const phone = '(max-width: 639px)';
const firstScene = 3.3;

export function Film({ className }: { className?: string }) {
  let ref = useRef<HTMLVideoElement>(null);
  let isInView = useInView(ref, { amount: 0.3 });
  let [paused, setPaused] = useState(false);
  let [reducedMotion, setReducedMotion] = useState(false);
  let [cut, setCut] = useState('16x9');

  useEffect(() => {
    setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
    setCut(matchMedia(phone).matches ? '9x16' : '16x9');
  }, []);

  useEffect(() => {
    let video = ref.current;
    if (!video) return;
    video.muted = true;
    if (isInView && !paused && !reducedMotion) {
      if (video.currentTime < firstScene) video.currentTime = firstScene;
      video.play().catch(() => {});
    } else video.pause();
  }, [isInView, paused, reducedMotion]);

  return (
    <div
      className={clsx(
        'relative mx-auto w-full max-w-[min(24rem,calc(72svh*9/16))] sm:max-w-none',
        className
      )}>
      <video
        ref={ref}
        muted
        loop
        playsInline
        controls={reducedMotion}
        preload="metadata"
        poster={`${basePath}/promo/film-poster-${cut}.jpg`}
        aria-label="Status Original in 37 seconds: your account is twelve words, five protocols share one chat list, and an AI agent pays a friend back while you approve on your phone."
        className="aspect-9/16 w-full rounded-xl bg-gray-50 object-cover shadow-2xl ring-1 shadow-brand-950/40 ring-white/15 sm:aspect-video sm:rounded-2xl">
        <source media={phone} src={`${basePath}/promo/film-9x16.mp4`} type="video/mp4" />
        <source src={`${basePath}/promo/film-16x9.mp4`} type="video/mp4" />
      </video>
      {!reducedMotion && (
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? 'Play the video' : 'Pause the video'}
          className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md ring-1 ring-gray-900/10 backdrop-blur hover:bg-white sm:right-4 sm:bottom-4">
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
  );
}
