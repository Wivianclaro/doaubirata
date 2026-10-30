(() => {
    const $ = id => document.getElementById(id);
    let sb, user = null, profile = null, formType = 'doacao', editing = null;
    const status = (msg, error = false) => { $('app-status').innerHTML = `<div class="aviso ${error ? 'erro' : ''}">${escapeHtml(msg)}</div>`; setTimeout(() => { $('app-status').innerHTML = '' }, 6500) };
    const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const show = id => { ['area', 'form-area', 'mine-area', 'settings-area'].forEach(x => { $(x).hidden = x !== id); }); $('inicio').hidden = id !== ''; };
    const modal = (panel = 'login-panel') => { ['login-panel', 'register-panel', 'forgot-panel'].forEach(x => $(x).hidden = x !== panel); $('auth-modal').classList.add('ativo') };
    const closeModal = () => $('auth-modal').classList.remove('ativo');
    async function init() {
        if (!window.supabase || !window.SUPABASE_URL || window.SUPABASE_URL.startsWith('COLE_')) { status('Configure a URL e a chave pública do Supabase em supabase-config.js para ativar o site.', true); return }
        sb = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
        const { data: { session } } = await sb.auth.getSession();
        user = session?.user || null;
        if (user) {
          await loadUser();
        } else {
          resetAuth();
        }

        sb.auth.onAuthStateChange((_event, session) => {
          user = session?.user || null;
          if (user) {
            loadUser();
          } else {
            resetAuth();
          }
        });

    async function loadUser() {
      if (!user) return;

      $('inicio').hidden = true;
      show('area');

      const { data, error } = await sb
        .from('usuarios')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

      if (error) {
        status('Erro ao carregar perfil: ' + error.message, true);
        return;
      }

      profile = data;

      $('boas-vindas').textContent =
        `Olá, ${profile?.nome || user.email}!`;

      await loadFeed();
    }
    
    function resetAuth() {
      user = null;
      profile = null;

      show('');
      $('area').hidden = true;
      $('inicio').hidden = false;

      const nav = $('nav-auth');
      if (nav) {
        nav.innerHTML = `
          <button class="btn-secundario" data-action="login">Entrar</button>
          <button class="btn-principal" data-action="register">Inscrever-se</button>
        `;
      }
    }
    async function loadFeed(term = '') {
        const pattern = term.trim();
        let q1 = sb.from('doacoes').select('id,usuario_id,item,categoria,descricao,foto,status,created_at,usuarios(nome)').eq('status', 'disponivel').order('created_at', { ascending: false });
        let q2 = sb.from('pedidos').select('id,usuario_id,item,categoria,descricao,status,created_at,usuarios(nome)').eq('status', 'aberto').order('created_at', { ascending: false });
        if (pattern) { q1 = q1.or(`item.ilike.%${pattern}%,categoria.ilike.%${pattern}%,descricao.ilike.%${pattern}%`); q2 = q2.or(`item.ilike.%${pattern}%,categoria.ilike.%${pattern}%,descricao.ilike.%${pattern}%`) }
        const [a, b] = await Promise.all([q1, q2]);
        if (a.error || b.error) { status(a.error?.message || b.error?.message, true); return }
        $('doacoes-lista').innerHTML = a.data.map(d => card(d, 'doacao')).join('') || '<p>Nenhuma doação disponível no momento.</p>';
        $('pedidos-lista').innerHTML = b.data.map(d => card(d, 'pedido')).join('') || '<p>Nenhum pedido aberto no momento.</p>';
    }
    function card(d, t) {
        const mine = d.usuario_id === user.id; const foto = t === 'doacao' && d.foto ? `<img class="imagem-publicacao" src="${escapeHtml(d.foto)}" alt="">` : '';
        return `<article class="card-publicacao">${foto}<div class="conteudo-card"><h3>${escapeHtml(d.item)}</h3><span class="categoria-publicacao">${escapeHtml(d.categoria)}</span><p>${escapeHtml(d.descricao)}</p><small>Publicado por ${escapeHtml(d.usuarios?.nome || 'usuário')}</small><p><span class="status-publicacao">${t === 'doacao' ? 'Disponível' : 'Pedido aberto'}</span></p>${mine ? `<div class="acoes-card"><button class="botao-card botao-editar" data-edit="${t}:${d.id}">Editar</button><button class="botao-card botao-excluir" data-delete="${t}:${d.id}">Excluir</button><button class="botao-card" data-finish="${t}:${d.id}">Finalizar</button></div>` : ''}</div></article>`
    }
    function openForm(type, row = null) { formType = type; editing = row; $('form-eyebrow').textContent = row ? 'EDITAR PUBLICAÇÃO' : type === 'doacao' ? 'FAZER UMA DOAÇÃO' : 'SOLICITAR UMA DOAÇÃO'; $('form-title').textContent = row ? 'Editar publicação' : type === 'doacao' ? 'Quero fazer uma doação 💚' : 'Preciso de uma doação 💛'; $('item').value = row?.item || ''; $('categoria').value = row?.categoria || ''; $('descricao').value = row?.descricao || ''; $('pub-id').value = row?.id || ''; $('foto-field').hidden = type !== 'doacao'; show('form-area') }
    async function savePublication(e) {
        e.preventDefault(); const row = { usuario_id: user.id, item: $('item').value.trim(), categoria: $('categoria').value, descricao: $('descricao').value.trim() }; if (!row.item || !row.categoria || !row.descricao) return status('Preencha todos os campos.', true);
        if (formType === 'doacao' && !editing) { const file = $('foto').files[0]; if (file) { if (file.size > 5 * 1024 * 1024) return status('A foto deve ter no máximo 5 MB.', true); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return status('Formato de imagem não permitido.', true); const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`; const up = await sb.storage.from('fotos-doacoes').upload(path, file); if (up.error) return status(up.error.message, true); row.foto = sb.storage.from('fotos-doacoes').getPublicUrl(path).data.publicUrl } }
        let result; if (editing) result = await sb.from(formType === 'doacao' ? 'doacoes' : 'pedidos').update({ item: row.item, categoria: row.categoria, descricao: row.descricao }).eq('id', editing.id).eq('usuario_id', user.id); else result = await sb.from(formType === 'doacao' ? 'doacoes' : 'pedidos').insert(row);
        if (result.error) return status(result.error.message, true); status(editing ? 'Publicação atualizada!' : 'Publicação cadastrada com sucesso!'); $('publication-form').reset(); editing = null; show('area'); await loadFeed();
    }
    async function loadMine() {
        const [a, b] = await Promise.all([sb.from('doacoes').select('*').eq('usuario_id', user.id).order('created_at', { ascending: false }), sb.from('pedidos').select('*').eq('usuario_id', user.id).order('created_at', { ascending: false })]); if (a.error || b.error) return status(a.error?.message || b.error?.message, true);
        const render = (arr, t) => arr.map(d => `<article class="card-publicacao"><div class="conteudo-card"><h3>${escapeHtml(d.item)}</h3><p>${escapeHtml(d.categoria)} · ${escapeHtml(d.status)}</p><p>${escapeHtml(d.descricao)}</p><button class="botao-card botao-editar" data-edit="${t}:${d.id}">Editar</button><button class="botao-card botao-excluir" data-delete="${t}:${d.id}">Excluir</button><button class="botao-card" data-finish="${t}:${d.id}">Finalizar</button></div></article>`).join('');
        $('mine-list').innerHTML = '<h2>Minhas doações</h2><div class="grade-publicacoes">' + (render(a.data, 'doacao') || '<p>Você ainda não publicou doações.</p>') + '</div><h2>Meus pedidos</h2><div class="grade-publicacoes">' + (render(b.data, 'pedido') || '<p>Você ainda não publicou pedidos.</p>') + '</div>'; show('mine-area')
    }
    async function edit(type, id) { const { data, error } = await sb.from(type === 'doacao' ? 'doacoes' : 'pedidos').select('*').eq('id', id).eq('usuario_id', user.id).single(); if (error) return status(error.message, true); openForm(type, data) }
    async function remove(type, id) { if (!confirm('Tem certeza que deseja excluir esta publicação?')) return; const { error } = await sb.from(type === 'doacao' ? 'doacoes' : 'pedidos').delete().eq('id', id).eq('usuario_id', user.id); if (error) return status(error.message, true); status('Publicação excluída.'); await loadFeed(); if (!$('mine-area').hidden) await loadMine() }
    async function finish(type, id) { const table = type === 'doacao' ? 'doacoes' : 'pedidos', value = type === 'doacao' ? 'finalizada' : 'atendido'; const { error } = await sb.from(table).update({ status: value }).eq('id', id).eq('usuario_id', user.id); if (error) return status(error.message, true); status('Publicação finalizada.'); await loadFeed(); if (!$('mine-area').hidden) await loadMine() }
    async function showSettings() { const { data, error } = await sb.from('usuarios').select('*').eq('id', user.id).single(); if (error) return status(error.message, true); $('profile-name').value = data.nome; $('profile-email').value = user.email; $('profile-phone').value = data.telefone || ''; show('settings-area') }
    document.addEventListener('click', async e => {
        const b = e.target.closest('[data-action],[data-edit],[data-delete],[data-finish]'); if (!b) return; const act = b.dataset.action; if (act === 'login') modal('login-panel'); if (act === 'register') modal('register-panel'); if (act === 'forgot') modal('forgot-panel'); if (act === 'close-modal') closeModal(); if (act === 'donate') openForm('doacao'); if (act === 'request') openForm('pedido'); if (act === 'home') { show('area'); await loadFeed() } if (act === 'mine') await loadMine(); if (act === 'settings') await showSettings(); if (act === 'logout') await sb.auth.signOut(); if (act === 'search') await loadFeed($('search').value);
        if (b.dataset.edit) { const [t, id] = b.dataset.edit.split(':'); await edit(t, id) } if (b.dataset.delete) { const [t, id] = b.dataset.delete.split(':'); await remove(t, id) } if (b.dataset.finish) { const [t, id] = b.dataset.finish.split(':'); await finish(t, id) }
    });
    $('login-form').addEventListener('submit', async e => { e.preventDefault(); const { error } = await sb.auth.signInWithPassword({ email: $('login-email').value, password: $('login-password').value }); if (error) status('E-mail ou senha incorretos: ' + error.message, true); else { closeModal(); status('Login realizado!') } });
    $('register-form').addEventListener('submit', async e => { e.preventDefault(); const nome = $('reg-name').value.trim(), email = $('reg-email').value.trim(), telefone = $('reg-phone').value.trim(), password = $('reg-password').value; if (nome.split(/\s+/).length < 2) return status('Digite seu nome completo.', true); const { data, error } = await sb.auth.signUp({ email, password, options: { data: { nome, telefone } } }); if (error) return status(error.message, true); closeModal(); status(data.session ? 'Cadastro realizado!' : 'Cadastro iniciado. Verifique seu e-mail para confirmar a conta.'); });
    $('publication-form').addEventListener('submit', savePublication);
    $('settings-form').addEventListener('submit', async e => { e.preventDefault(); const { error } = await sb.from('usuarios').update({ nome: $('profile-name').value.trim(), telefone: $('profile-phone').value.trim() }).eq('id', user.id); if (error) return status(error.message, true); status('Dados atualizados!'); await loadUser() });
    $('password-form').addEventListener('submit', async e => { e.preventDefault(); const { error } = await sb.auth.updateUser({ password: $('new-password').value }); if (error) return status(error.message, true); $('password-form').reset(); status('Senha alterada com sucesso!') });
    $('forgot-form').addEventListener('submit', async e => { e.preventDefault(); const { error } = await sb.auth.resetPasswordForEmail($('forgot-email').value, { redirectTo: location.origin + location.pathname }); if (error) return status(error.message, true); closeModal(); status('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.') });
    init();
})();
