import { Calendar, Eye } from 'lucide-react';
import type { VideoInfo } from '../types';
import { formatDuration, formatUploadDate, formatViews } from '../utils/format';

export function VideoPreviewCard({ info }: { info: VideoInfo }) {
  const views = formatViews(info.viewCount);
  const date = formatUploadDate(info.uploadDate);
  return (
    <article className="flex animate-fade-in flex-col gap-5 sm:flex-row">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-zinc-200 sm:w-72 dark:bg-zinc-800">
        <img
          src={info.thumbnail}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        {info.duration !== null && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/80 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white">
            {formatDuration(info.duration)}
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <h2 className="line-clamp-2 text-lg font-bold leading-snug sm:text-xl" title={info.title}>
          {info.title}
        </h2>
        <p className="mt-2 text-sm font-medium text-zinc-600 dark:text-zinc-300">
          {info.channelUrl ? (
            <a href={info.channelUrl} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
              {info.channel}
            </a>
          ) : (
            info.channel
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
          {views && (
            <span className="inline-flex items-center gap-1.5">
              <Eye className="h-4 w-4" aria-hidden /> {views}
            </span>
          )}
          {date && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-4 w-4" aria-hidden /> {date}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
