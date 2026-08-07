<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DataController;
use App\Http\Controllers\Api\RpcController;
use App\Http\Controllers\Api\StorageController;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('/auth/me', [AuthController::class, 'me']);
        Route::post('/auth/logout', [AuthController::class, 'logout']);
        Route::post('/data/query', [DataController::class, 'query']);
        Route::post('/rpc/replace-source-chunks', [RpcController::class, 'replaceSourceChunks']);
        Route::post('/rpc/match-document-chunks', [RpcController::class, 'matchDocumentChunks']);
        Route::post('/storage/upload', [StorageController::class, 'upload']);
        Route::get('/storage/download', [StorageController::class, 'download']);
        Route::delete('/storage', [StorageController::class, 'delete']);
    });
    Route::middleware('internal')->group(function (): void {
        Route::post('/internal/data/query', [DataController::class, 'query']);
        Route::post('/internal/rpc/replace-source-chunks', [RpcController::class, 'replaceSourceChunks']);
        Route::post('/internal/rpc/match-document-chunks', [RpcController::class, 'matchDocumentChunks']);
        Route::post('/internal/storage/upload', [StorageController::class, 'upload']);
        Route::get('/internal/storage/download', [StorageController::class, 'download']);
        Route::delete('/internal/storage', [StorageController::class, 'delete']);
    });
});
