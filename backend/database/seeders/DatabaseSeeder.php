<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $email = strtolower((string) env('ADMIN_EMAIL', 'admin@klabs.co'));
        $password = (string) env('ADMIN_PASSWORD', '');

        if ($password === '') {
            $this->command?->warn('ADMIN_PASSWORD is empty; no administrator was seeded.');

            return;
        }

        $user = User::query()->firstOrNew(['email' => $email]);
        $user->id ??= (string) Str::uuid();
        $user->fill([
            'name' => env('ADMIN_NAME', 'K-Labs admin'),
            'role' => 'administrator',
            'password' => Hash::make($password),
        ]);
        $user->save();
        DB::table('profiles')->updateOrInsert(
            ['id' => $user->id],
            ['email' => $email, 'full_name' => $user->name, 'role' => 'administrator', 'created_at' => now(), 'updated_at' => now()],
        );
    }
}
