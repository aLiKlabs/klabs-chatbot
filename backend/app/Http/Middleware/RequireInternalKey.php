<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class RequireInternalKey
{
    public function handle(Request $request, Closure $next): Response
    {
        $expected = (string) config('services.klabs.internal_key');
        $provided = (string) $request->header('X-Internal-Key');

        abort_if($expected === '' || ! hash_equals($expected, $provided), 401, 'Invalid internal key.');

        return $next($request);
    }
}
