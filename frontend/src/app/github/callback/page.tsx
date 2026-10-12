'use client';

import { Suspense } from 'react';
import OAuthCallback, { OAuthLoading } from '@/components/user/OAuthCallback';

export default function GitHubCallbackPage() {
  return (
    <Suspense fallback={<OAuthLoading text="正在加载…" />}>
      <OAuthCallback provider="github" />
    </Suspense>
  );
}
