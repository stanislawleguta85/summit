import { createClient } from 'npm:@supabase/supabase-js@2.110.8';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
};

type CreateMemberBody = {
  assigned_trainer_id?: unknown;
  email?: unknown;
  first_name?: unknown;
  group_days_per_week?: unknown;
  last_name?: unknown;
  password?: unknown;
  phone_number?: unknown;
  role?: unknown;
  training_model?: unknown;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Metodo no permitido.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authorization = request.headers.get('Authorization');

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'La funcion no esta configurada correctamente.' }, 500);
  }

  if (!authorization?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Debes iniciar sesion.' }, 401);
  }

  const token = authorization.slice('Bearer '.length);
  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user: actor },
    error: actorError,
  } = await callerClient.auth.getUser(token);
  if (actorError || !actor) {
    return jsonResponse({ error: 'La sesion no es valida.' }, 401);
  }

  const profileResult = await callerClient
    .from('user_profiles')
    .select('company_id, status')
    .eq('user_id', actor.id)
    .maybeSingle();

  if (profileResult.error) {
    console.error('Staff creator profile check failed:', profileResult.error.message);
    return jsonResponse(
      { error: `No se pudo comprobar tu perfil: ${profileResult.error.message}` },
      403
    );
  }

  const actorProfile = profileResult.data;
  if (!actorProfile || actorProfile.status !== 'approved') {
    return jsonResponse({ error: 'No tienes permiso para crear empleados.' }, 403);
  }

  const assignmentResult = await callerClient
    .from('user_roles')
    .select('role_id')
    .eq('user_id', actor.id)
    .eq('company_id', actorProfile.company_id);
  if (assignmentResult.error) {
    console.error('Staff creator role check failed:', assignmentResult.error.message);
    return jsonResponse(
      { error: `No se pudieron comprobar tus roles: ${assignmentResult.error.message}` },
      403
    );
  }

  const roleIds = (assignmentResult.data ?? []).map(
    (assignment: { role_id: string }) => assignment.role_id
  );
  if (roleIds.length === 0) {
    return jsonResponse({ error: 'No tienes permiso para crear empleados.' }, 403);
  }

  const grantResult = await callerClient
    .from('role_permissions')
    .select('scope, permission:permissions!inner(resource, action)')
    .in('role_id', roleIds);
  if (grantResult.error) {
    console.error('Staff creator permission check failed:', grantResult.error.message);
    return jsonResponse(
      { error: `No se pudieron comprobar tus permisos: ${grantResult.error.message}` },
      403
    );
  }

  const grants = (grantResult.data ?? []).filter((grant) => {
    const permission = Array.isArray(grant.permission)
      ? grant.permission[0]
      : grant.permission;
    return permission?.resource === 'members' && permission.action === 'create';
  });
  const canCreateAll = grants.some((grant) => grant.scope === 'all');
  const canCreateAssigned = grants.some((grant) => grant.scope === 'assigned');
  if (!canCreateAll && !canCreateAssigned) {
    return jsonResponse({ error: 'No tienes permiso para crear cuentas.' }, 403);
  }

  let body: CreateMemberBody;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Los datos enviados no son validos.' }, 400);
  }

  const email = normalizeString(body.email).toLowerCase();
  const assignedTrainerId = normalizeString(body.assigned_trainer_id);
  const firstName = normalizeString(body.first_name);
  const groupDaysPerWeek =
    typeof body.group_days_per_week === 'number' && Number.isInteger(body.group_days_per_week)
      ? body.group_days_per_week
      : null;
  const lastName = normalizeString(body.last_name);
  const password = typeof body.password === 'string' ? body.password : '';
  const phoneNumber = normalizeString(body.phone_number);
  const role = normalizeString(body.role);
  const trainingModel = normalizeString(body.training_model);

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return jsonResponse({ error: 'Introduce una direccion de correo valida.' }, 400);
  }
  if (firstName.length < 2 || lastName.length < 2) {
    return jsonResponse({ error: 'Introduce el nombre y los apellidos.' }, 400);
  }
  if (
    phoneNumber.length < 7 ||
    phoneNumber.length > 30 ||
    !/^[+0-9][0-9\s().-]*$/.test(phoneNumber) ||
    phoneNumber.replace(/\D/g, '').length < 7 ||
    phoneNumber.replace(/\D/g, '').length > 15
  ) {
    return jsonResponse({ error: 'Introduce un numero de telefono valido.' }, 400);
  }
  if (password.length < 10) {
    return jsonResponse({ error: 'La contrasena temporal necesita al menos 10 caracteres.' }, 400);
  }
  if (role !== 'customer' && role !== 'trainer') {
    return jsonResponse({ error: 'Selecciona el rol de cliente o entrenador.' }, 400);
  }
  if (role === 'trainer' && !canCreateAll) {
    return jsonResponse({ error: 'No tienes permiso para crear entrenadores.' }, 403);
  }
  if (
    role === 'customer' &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      assignedTrainerId
    )
  ) {
    return jsonResponse({ error: 'Selecciona un entrenador para el cliente.' }, 400);
  }
  if (
    role === 'customer' &&
    trainingModel !== 'group' &&
    trainingModel !== 'individual'
  ) {
    return jsonResponse({ error: 'Selecciona el modelo de entrenamiento.' }, 400);
  }
  if (
    role === 'customer' &&
    trainingModel === 'group' &&
    (groupDaysPerWeek === null || groupDaysPerWeek < 1 || groupDaysPerWeek > 7)
  ) {
    return jsonResponse({ error: 'Selecciona entre 1 y 7 dias de grupo por semana.' }, 400);
  }

  const { data: createdUserResult, error: createError } =
    await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        company_id: actorProfile.company_id,
        created_by_admin: actor.id,
        first_name: firstName,
        last_name: lastName,
        phone_number: phoneNumber,
      },
    });

  if (createError || !createdUserResult.user) {
    const duplicate =
      createError?.code === 'email_exists' ||
      createError?.message.toLowerCase().includes('already') ||
      createError?.message.toLowerCase().includes('registered');
    return jsonResponse(
      {
        error: duplicate
          ? 'Ya existe una cuenta con esta direccion de correo.'
          : createError?.message || 'La cuenta no se pudo crear.',
      },
      duplicate ? 409 : 400
    );
  }

  const createdUser = createdUserResult.user;
  const { error: finalizeError } = await adminClient.rpc(
    'finalize_admin_created_member',
    {
      assigned_trainer_user_id: role === 'customer' ? assignedTrainerId : null,
      created_by_user_id: actor.id,
      member_role: role,
      selected_group_days_per_week:
        role === 'customer' && trainingModel === 'group' ? groupDaysPerWeek : null,
      selected_training_model: role === 'customer' ? trainingModel : null,
      target_user_id: createdUser.id,
      target_company_id: actorProfile.company_id,
    }
  );

  if (finalizeError) {
    const { error: rollbackError } = await adminClient.auth.admin.deleteUser(createdUser.id);
    if (rollbackError) {
      console.error('Could not roll back staff auth user:', rollbackError.message);
    }
    return jsonResponse(
      { error: finalizeError.message || 'El perfil del empleado no se pudo completar.' },
      500
    );
  }

  return jsonResponse(
    {
      email,
      role,
      user_id: createdUser.id,
    },
    201
  );
});

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });
}
