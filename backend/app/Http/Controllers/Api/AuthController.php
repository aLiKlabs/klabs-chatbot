<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $input = $request->validate(['email' => ['required', 'email'], 'password' => ['required', 'string']]);
        $email = strtolower($input['email']);
        $allowed = config('services.klabs.admin_emails', []);
        abort_if($allowed !== [] && ! in_array($email, $allowed, true), 403, 'This account is not approved.');

        $user = User::where('email', $email)->first();
        abort_if(! $user || ! Hash::check($input['password'], $user->password), 422, 'The email or password is incorrect.');
        abort_if($user->role !== 'administrator', 403, 'Administrator access required.');

        $user->tokens()->where('name', 'dashboard')->delete();
        $token = $user->createToken('dashboard', ['admin'])->plainTextToken;

        return response()->json(['token' => $token, 'user' => $this->payload($user)]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->payload($request->user())]);
    }

    public function logout(Request $request): JsonResponse
    {
        $request->user()?->currentAccessToken()?->delete();

        return response()->json(['ok' => true]);
    }

    private function payload(User $user): array
    {
        $profile = DB::table('profiles')->where('id', $user->id)->first();

        return [
            'id' => $user->id,
            'email' => $user->email,
            'role' => $user->role,
            'full_name' => $profile?->full_name ?? $user->name,
        ];
    }
}
