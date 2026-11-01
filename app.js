(() => {
    const $ = id => document.getElementById(id);

    let sb, user = null, profile = null, formType = 'doacao', editing = null;

    const status = (msg, error = false) => {
        $('app-status').innerHTML =
            `<div class="aviso ${error ? 'erro' : ''}">${escapeHtml(msg)}</div>`;

        setTimeout(() => {
            $('app-status').innerHTML = '';
        }, 6500);
    };

    const escapeHtml = s =>
        String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[c]));

    const show = id => {
        ['area', 'form-area', 'mine-area', 'detalhes-area', 'settings-area'].forEach(x => {
            const el = $(x);
            if (el) el.hidden = x !== id;
        });

        const publicVisible = id === '';

        ['inicio', 'como-funciona'].forEach(x => {
            const el = $(x);
            if (el) el.hidden = !publicVisible;
        });

        const btnVoltar = $('btn-voltar-mine');

        if (btnVoltar) {
            btnVoltar.hidden =
                id !== 'mine-area' &&
                id !== 'form-area' &&
                id !== 'settings-area';
        }

        const nav = $('nav-auth');
        if (nav) {
            const estaEmConfiguracoes =
                id === 'settings-area' ||
                id === 'mine-area' ||
                id === 'form-area' ||
                id === 'detalhes-area';
            
            nav.innerHTML = estaEmConfiguracoes
                ? `
                    <button class="btn-secundario" data-action="back">Voltar</button>
                    <button class="btn-login" data-action="logout">Sair</button>
                `
                : `
                    <button class="btn-secundario" data-action="settings">Configurações</button>
                    <button class="btn-login" data-action="logout">Sair</button>
                `;

            const esconderBotoes = false;
        }

        const pesquisa = $('header-search');

        if (pesquisa) pesquisa.hidden = id !== 'area';
    };

    const modal = (panel = 'login-panel') => {
        ['login-panel', 'register-panel', 'forgot-panel'].forEach(x => {
            $(x).hidden = x !== panel;
        });

        $('auth-modal').classList.add('ativo');
    };

    const closeModal = () => {
        $('auth-modal').classList.remove('ativo');
    };

    async function init() {
        if (
            !window.supabase ||
            !window.SUPABASE_URL ||
            window.SUPABASE_URL.startsWith('COLE_')
        ) {
            status(
                'Configure a URL e a chave pública do Supabase em supabase-config.js para ativar o site.',
                true
            );
            return;
        }

        sb = window.supabase.createClient(
            window.SUPABASE_URL,
            window.SUPABASE_ANON_KEY
        );

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
    }

    async function loadUser() {
        if (!user) return;

        show('area');

        $('header-search').hidden = false;
        $('site-header').classList.add('header-logado');

        const nav = $('nav-auth');
        if (nav) {
            const estaEmConfiguracoes = $('settings-panel') &&
                !$('settings-panel').hidden;

            nav.innerHTML = estaEmConfiguracoes
                ? `
                    <button class="btn-secundario" data-action="back">← Voltar</button>
                    <button class="btn-login" data-action="logout">Sair</button>
                `
                : `
                    <button class="btn-secundario" data-action="settings">Configurações</button>
                    <button class="btn-login" data-action="logout">Sair</button>
                `;
        }

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

        $('header-search').hidden = true;
        $('site-header').classList.remove('header-logado');

        const nav = $('nav-auth');

        if (nav) {
            nav.innerHTML = '';
        }
    }

    async function loadFeed(term = '') {
        const pattern = term.trim();

        let q1 = sb
            .from('doacoes')
            .select('id,usuario_id,item,categoria,descricao,foto,status,created_at,usuarios(nome,telefone)')
            .eq('status', 'disponivel')
            .order('created_at', { ascending: false });

        let q2 = sb
            .from('pedidos')
            .select('id,usuario_id,item,categoria,descricao,status,created_at,usuarios(nome,telefone)')
            .eq('status', 'aberto')
            .order('created_at', { ascending: false });

        if (pattern) {
            q1 = q1.or(
                `item.ilike.%${pattern}%,categoria.ilike.%${pattern}%,descricao.ilike.%${pattern}%`
            );

            q2 = q2.or(
                `item.ilike.%${pattern}%,categoria.ilike.%${pattern}%,descricao.ilike.%${pattern}%`
            );
        }

        const [a, b] = await Promise.all([q1, q2]);

        if (a.error || b.error) {
            status(a.error?.message || b.error?.message, true);
            return;
        }

        $('doacoes-lista').innerHTML =
            a.data.map(d => card(d, 'doacao')).join('') ||
            '<p>Nenhuma doação disponível no momento.</p>';

        $('pedidos-lista').innerHTML =
            b.data.map(d => card(d, 'pedido')).join('') ||
            '<p>Nenhum pedido aberto no momento.</p>';
    }

function card(d, t) {
    const foto =
        t === 'doacao' && d.foto
            ? `<img class="imagem-publicacao" src="${escapeHtml(d.foto)}" alt="">`
            : '';

    return `
        <article class="card-publicacao">
            ${foto}

            <div class="conteudo-card">
                <h3>${escapeHtml(d.item)}</h3>

                <span class="categoria-publicacao">
                    Categoria: ${escapeHtml(d.categoria)}
                </span>

                <p>${escapeHtml(d.descricao)}</p>

                <p>
                    <span class="status-publicacao">
                        ${t === 'doacao' ? 'Disponível' : 'Pedido aberto'}
                    </span>
                </p>

                <div class="rodape-card">
                    <small class="autor-publicacao">
                        Publicado por ${escapeHtml(d.usuarios?.nome || 'usuário')}
                    </small>

                    <button
                        type="button"
                        class="link-detalhes"
                        data-details="${t}:${d.id}">
                        Ver detalhes →
                    </button>
                </div>
            </div>
        </article>
    `;
}

async function openDetails(type, id) {
    const tabela = type === 'doacao' ? 'doacoes' : 'pedidos';

    const { data, error } = await sb
        .from(tabela)
        .select('*, usuarios(nome, telefone)')
        .eq('id', id)
        .single();

    if (error || !data) {
        alert('Não foi possível carregar os detalhes desta publicação.');
        console.error(error);
        return;
    }

    const eDoacao = type === 'doacao';
    const minhaPublicacao = user && data.usuario_id === user.id;

    const foto = eDoacao && data.foto
        ? `<img class="detalhes-foto" src="${escapeHtml(data.foto)}" alt="${escapeHtml(data.item)}">`
        : '';

    const nome = data.usuarios?.nome || 'Usuário';
    const telefone = data.usuarios?.telefone || 'Telefone não informado';

    $('detalhes-conteudo').innerHTML = `

        ${foto}

        <h1>${escapeHtml(data.item)}</h1>

        <span class="categoria-publicacao">
            Categoria: ${escapeHtml(data.categoria || 'Não informada')}
        </span>

        <h2>${eDoacao ? 'Sobre esta doação' : 'Sobre este pedido'}</h2>
        <p>${escapeHtml(data.descricao || 'Nenhuma descrição informada.')}</p>

        <section class="detalhes-contato">
            <h2>Contato de quem publicou</h2>
            <p><strong>Nome:</strong> ${escapeHtml(nome)}</p>
            <p><strong>Telefone:</strong> ${escapeHtml(telefone)}</p>
        </section>

        ${minhaPublicacao ? `
            <section class="detalhes-acoes">
                <h2>Gerenciar publicação</h2>

                <button type="button" class="botao-card botao-editar"
                    data-edit="${type}:${data.id}">
                    Editar publicação
                </button>

                <button type="button" class="botao-card"
                    data-finish="${type}:${data.id}">
                    ${eDoacao ? 'Marcar como doado' : 'Marcar como atendido'}
                </button>

                <button type="button" class="botao-card botao-excluir"
                    data-delete="${type}:${data.id}">
                    Excluir publicação
                </button>
            </section>
        ` : ''}
    `;

    show('detalhes-area');
}
    
    function openForm(type, row = null) {
        formType = type;
        editing = row;

        $('form-eyebrow').textContent = row
            ? 'EDITAR PUBLICAÇÃO'
            : type === 'doacao'
                ? 'FAZER UMA DOAÇÃO'
                : 'SOLICITAR UMA DOAÇÃO';

        $('form-title').textContent = row
            ? 'Editar publicação'
            : type === 'doacao'
                ? 'Quero fazer uma doação 💚'
                : 'Preciso de uma doação 💛';

        $('item').value = row?.item || '';
        $('categoria').value = row?.categoria || '';
        $('descricao').value = row?.descricao || '';
        $('pub-id').value = row?.id || '';
        $('foto-field').hidden = type !== 'doacao';

        show('form-area');
    }

    async function savePublication(e) {
        e.preventDefault();

        if (!user) {
            return status('Faça login para publicar.', true);
        }

        const row = {
            usuario_id: user.id,
            item: $('item').value.trim(),
            categoria: $('categoria').value,
            descricao: $('descricao').value.trim()
        };

        if (!row.item || !row.categoria || !row.descricao) {
            return status('Preencha todos os campos.', true);
        }

        if (formType === 'doacao' && !editing) {
            const file = $('foto').files[0];

            if (file) {
                if (file.size > 5 * 1024 * 1024) {
                    return status('A foto deve ter no máximo 5 MB.', true);
                }

                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
                    return status('Formato de imagem não permitido.', true);
                }

                const path =
                    `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

                const up = await sb
                    .storage
                    .from('fotos-doacoes')
                    .upload(path, file);

                if (up.error) {
                    return status(up.error.message, true);
                }

                row.foto = sb
                    .storage
                    .from('fotos-doacoes')
                    .getPublicUrl(path)
                    .data.publicUrl;
            }
        }

        let result;

        if (editing) {
            result = await sb
                .from(formType === 'doacao' ? 'doacoes' : 'pedidos')
                .update({
                    item: row.item,
                    categoria: row.categoria,
                    descricao: row.descricao
                })
                .eq('id', editing.id)
                .eq('usuario_id', user.id);
        } else {
            result = await sb
                .from(formType === 'doacao' ? 'doacoes' : 'pedidos')
                .insert(row);
        }

        if (result.error) {
            return status(result.error.message, true);
        }

        status(
            editing
                ? 'Publicação atualizada!'
                : 'Publicação cadastrada com sucesso!'
        );

        $('publication-form').reset();

        editing = null;

        show('area');

        await loadFeed();
    }

    async function loadMine() {
        if (!user) {
            return status('Faça login para ver suas publicações.', true);
        }

        const [a, b] = await Promise.all([
            sb
                .from('doacoes')
                .select('*, usuarios(nome, telefone)')
                .eq('usuario_id', user.id)
                .order('created_at', { ascending: false }),

           sb
               .from('pedidos')
               .select('*, usuarios(nome, telefone)')
               .eq('usuario_id', user.id)
               .order('created_at', { ascending: false })
         ]);

         if (a.error || b.error) {
             return status(a.error?.message || b.error?.message, true);
         }

         const render = (arr, tipo) =>
             arr.map(d => card(d, tipo)).join('');

        $('mine-list').innerHTML = `
            <h2>Minhas doações</h2>

            <div class="grade-publicacoes">
                ${render(a.data, 'doacao') ||
                    '<p>Você ainda não publicou doações.</p>'}
            </div>

            <h2>Meus pedidos</h2>

            <div class="grade-publicacoes">
                ${render(b.data, 'pedido') ||
                '<p>Você ainda não publicou pedidos.</p>'}
            </div>
        `;

       show('mine-area');
    }

    async function edit(type, id) {
        const { data, error } = await sb
            .from(type === 'doacao' ? 'doacoes' : 'pedidos')
            .select('*')
            .eq('id', id)
            .eq('usuario_id', user.id)
            .single();

        if (error) {
            return status(error.message, true);
        }

        openForm(type, data);
    }

    async function remove(type, id) {
        if (!confirm('Tem certeza que deseja excluir esta publicação?')) {
            return;
        }

        const { error } = await sb
            .from(type === 'doacao' ? 'doacoes' : 'pedidos')
            .delete()
            .eq('id', id)
            .eq('usuario_id', user.id);

        if (error) {
            return status(error.message, true);
        }

        status('Publicação excluída.');

        await loadFeed();

        if (!$('mine-area').hidden) {
            await loadMine();
        }
    }

    async function finish(type, id) {
        const table = type === 'doacao' ? 'doacoes' : 'pedidos';
        const value = type === 'doacao' ? 'finalizada' : 'atendido';

        const { error } = await sb
            .from(table)
            .update({ status: value })
            .eq('id', id)
            .eq('usuario_id', user.id);

        if (error) {
            return status(error.message, true);
        }

        status('Publicação finalizada.');

        await loadFeed();

        if (!$('mine-area').hidden) {
            await loadMine();
        }
    }

    async function showSettings() {
        if (!user) {
            return status('Faça login para acessar as configurações.', true);
        }

        $('profile-name').value = profile?.nome || '';
        $('profile-email').value = user.email || '';
        $('profile-phone').value = profile?.telefone || '';

        show('settings-area');
    }

    async function excluirConta() {
        if (!user || !sb) {
            return status(
                'Você precisa estar conectado para excluir sua conta.',
                true
            );
        }

        const confirmacao = confirm(
            'Tem certeza que deseja excluir sua conta? Essa ação não poderá ser desfeita.'
        );

        if (!confirmacao) return;

        const { error } = await sb.functions.invoke('excluir-conta');

        if (error) {
            return status('Erro ao excluir conta: ' + error.message, true);
        }

        status('Conta excluída com sucesso!');

        await sb.auth.signOut();
    }

    document.addEventListener('click', async e => {
        const b = e.target.closest('[data-action],[data-edit],[data-delete],[data-finish],[data-details]');

        if (!b) return;

        const act = b.dataset.action;

        if (b.dataset.details) {
            const [type, id] = b.dataset.details.split(':');
            await openDetails(type, id);
            return;
        }

        if (act === 'login') modal('login-panel');
        if (act === 'register') modal('register-panel');
        if (act === 'forgot') modal('forgot-panel');
        if (act === 'close-modal') closeModal();

        if (act === 'donate') openForm('doacao');
        if (act === 'request') openForm('pedido');

        if (act === 'home') {
            show('area');
            await loadFeed();
        }

        if (act === 'mine') {
            await loadMine();
        }

        if (act === 'settings') {
            await showSettings();
        }

            if (act === 'back') {
            show('area');
            await loadFeed();
        }

        if (act === 'delete-account') {
            await excluirConta();
        }

        if (act === 'logout') {
            await sb.auth.signOut();
        }

        if (act === 'search') {
            await loadFeed($('search').value);
        }

        if (b.dataset.edit) {
            const [t, id] = b.dataset.edit.split(':');
            await edit(t, id);
        }

        if (b.dataset.delete) {
            const [t, id] = b.dataset.delete.split(':');
            await remove(t, id);
        }

        if (b.dataset.finish) {
            const [t, id] = b.dataset.finish.split(':');
            await finish(t, id);
        }
    });

    $('login-form').addEventListener('submit', async e => {
        e.preventDefault();

        const { error } = await sb.auth.signInWithPassword({
            email: $('login-email').value,
            password: $('login-password').value
        });

        if (error) {
            status('E-mail ou senha incorretos: ' + error.message, true);
        } else {
            closeModal();
            status('Login realizado!');
        }
    });

    $('register-form').addEventListener('submit', async e => {
        e.preventDefault();

        const nome = $('reg-name').value.trim();
        const email = $('reg-email').value.trim();
        const telefone = $('reg-phone').value.trim();
        const password = $('reg-password').value;

        if (nome.split(/\s+/).length < 2) {
            return status('Digite seu nome completo.', true);
        }

        const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
                data: {
                    nome,
                    telefone
                }
            }
        });

        if (error) {
            return status(error.message, true);
        }

        closeModal();

        status(
            data.session
                ? 'Cadastro realizado!'
                : 'Cadastro iniciado. Verifique seu e-mail para confirmar a conta.'
        );
    });

    $('publication-form').addEventListener('submit', savePublication);

    $('settings-form').addEventListener('submit', async e => {
        e.preventDefault();

        const { error } = await sb
            .from('usuarios')
            .update({
                nome: $('profile-name').value.trim(),
                telefone: $('profile-phone').value.trim()
            })
            .eq('id', user.id);

        if (error) {
            return status(error.message, true);
        }

        status('Dados atualizados!');

        await loadUser();
    });

    $('password-form').addEventListener('submit', async e => {
        e.preventDefault();

        const senhaAtual = $('current-password').value;
        const novaSenha = $('new-password').value;
        const confirmarSenha = $('confirm-password').value;

        if (novaSenha !== confirmarSenha) {
            return status(
                'A confirmação da nova senha não corresponde.',
                true
            );
        }

        if (novaSenha.length < 6) {
            return status(
                'A nova senha deve ter pelo menos 6 caracteres.',
                true
            );
        }

        const { error: loginError } = await sb.auth.signInWithPassword({
            email: user.email,
            password: senhaAtual
        });

        if (loginError) {
            return status('A senha atual está incorreta.', true);
        }

        const { error } = await sb.auth.updateUser({
            password: novaSenha
        });

        if (error) {
            return status(error.message, true);
        }

        $('password-form').reset();

        status('Senha alterada com sucesso!');
    });

    $('forgot-form').addEventListener('submit', async e => {
        e.preventDefault();

        const { error } = await sb.auth.resetPasswordForEmail(
            $('forgot-email').value,
            {
                redirectTo: location.origin + location.pathname
            }
        );

        if (error) {
            return status(error.message, true);
        }

        closeModal();

        status(
            'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.'
        );
    });

    init();
})();
