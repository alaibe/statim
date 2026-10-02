'use client';

import clsx from 'clsx';
import { useInView } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { basePath } from '@/lib/site';

const firstScene = 3.3;

const cuts = {
  '9x16': 'mx-auto max-w-[min(24rem,calc(72svh*9/16))] landscape:hidden',
  '16x9': 'mx-auto max-w-[calc(80svh*16/9)] portrait:hidden',
};

function play(video: HTMLVideoElement) {
  if (video.currentTime < firstScene) video.currentTime = firstScene;
  video.play().catch(() => {});
}

export function Film({ className }: { className?: string }) {
  let [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  return (
    <div className={className}>
      <Cut cut="9x16" reducedMotion={reducedMotion} />
      <Cut cut="16x9" reducedMotion={reducedMotion} />
    </div>
  );
}

function Cut({ cut, reducedMotion }: { cut: keyof typeof cuts; reducedMotion: boolean }) {
  let ref = useRef<HTMLVideoElement>(null);
  let isInView = useInView(ref, { amount: 0.3 });
  let [stopped, setStopped] = useState(false);
  let [playing, setPlaying] = useState(false);

  useEffect(() => {
    let video = ref.current;
    if (!video) return;
    video.muted = true;
    if (isInView && !stopped && !reducedMotion) play(video);
    else video.pause();
  }, [isInView, stopped, reducedMotion]);

  function toggle() {
    let video = ref.current;
    if (!video) return;
    setStopped(playing);
    if (playing) video.pause();
    else play(video);
  }

  return (
    <div className={clsx('relative w-full', cuts[cut])}>
      <video
        ref={ref}
        muted
        loop
        playsInline
        controls={reducedMotion}
        preload="none"
        poster={`${basePath}/promo/film-poster-${cut}.jpg`}
        src={`${basePath}/promo/film-${cut}.mp4`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        aria-label="Statim in 37 seconds: your account is twelve words, five protocols share one chat list, and an AI agent pays a friend back while you approve on your phone."
        className={clsx(
          'w-full bg-gray-50 object-cover shadow-[0_40px_120px_-30px_rgb(17_24_39/0.45)] ring-1 ring-gray-900/15',
          cut === '9x16' ? 'aspect-9/16 rounded-xl' : 'aspect-video rounded-2xl'
        )}
      />
      {!reducedMotion && (
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? 'Pause the video' : 'Play the video'}
          className="absolute right-3 bottom-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-md ring-1 ring-gray-900/10 backdrop-blur hover:bg-white sm:right-4 sm:bottom-4">
          <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
            {playing ? (
              <path d="M4 3h3v10H4zM9 3h3v10H9z" />
            ) : (
              <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" />
            )}
          </svg>
        </button>
      )}
    </div>
  );
}
