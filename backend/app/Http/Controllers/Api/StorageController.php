<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class StorageController extends Controller
{
    public function upload(Request $request): JsonResponse
    {
        $input = $request->validate(['path' => ['required', 'string', 'max:500'], 'file' => ['required', 'file', 'max:20480']]);
        $path = $this->path($input['path']);
        Storage::disk('local')->putFileAs(dirname($path), $input['file'], basename($path));

        return response()->json(['data' => ['path' => $path], 'error' => null]);
    }

    public function download(Request $request)
    {
        $path = $this->path((string) $request->query('path'));
        abort_unless(Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->download($path);
    }

    public function delete(Request $request): JsonResponse
    {
        $paths = $request->validate(['paths' => ['required', 'array'], 'paths.*' => ['string']])['paths'];
        Storage::disk('local')->delete(array_map(fn ($path) => $this->path($path), $paths));

        return response()->json(['data' => null, 'error' => null]);
    }

    private function path(string $path): string
    {
        $path = ltrim(str_replace('\\', '/', $path), '/');
        abort_if($path === '' || str_contains($path, '..') || ! preg_match('/^[A-Za-z0-9._\/-]+$/', $path), 422, 'Invalid storage path.');

        return 'chatbot-documents/'.$path;
    }
}
