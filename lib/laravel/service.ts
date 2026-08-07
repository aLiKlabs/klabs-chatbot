import { LaravelClient } from "@/lib/laravel/client";
import { getServerEnvironment } from "@/lib/env";

export function createServiceClient() {
  const environment = getServerEnvironment();
  return new LaravelClient({ internalKey: environment.LARAVEL_INTERNAL_KEY });
}
