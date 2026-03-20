const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Connexion Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

console.log('✅ Supabase connecté');

// ============ ROUTES API ============

// Authentification
app.post('/api/login', async (req, res) => {
    const { pseudo, code } = req.body;
    try {
        let { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('pseudo', pseudo)
            .single();
        
        if (!user) {
            const { data: newUser, error } = await supabase
                .from('users')
                .insert({ pseudo, code, amis: '[]', photo: null })
                .select()
                .single();
            
            if (error) throw error;
            user = newUser;
        } else if (user.code !== code) {
            return res.status(401).json({ error: 'Code incorrect' });
        }
        
        res.json({ 
            success: true, 
            user: { 
                pseudo: user.pseudo, 
                amis: JSON.parse(user.amis || '[]'), 
                photo: user.photo 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Messages publics
app.get('/api/messages/public/null', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('messages')
            .select('*')
            .eq('type', 'public')
            .order('date', { ascending: true });
        
        if (error) throw error;
        res.json(data.map(m => ({ ...m, likes: JSON.parse(m.likes || '[]') })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Messages par type
app.get('/api/messages/:type/:dest', async (req, res) => {
    const { type, dest } = req.params;
    try {
        let query = supabase.from('messages').select('*').eq('type', type);
        
        if (type !== 'public' && dest !== 'null') {
            query = query.eq('dest', dest);
        }
        
        const { data, error } = await query.order('date', { ascending: true });
        
        if (error) throw error;
        res.json(data.map(m => ({ ...m, likes: JSON.parse(m.likes || '[]') })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Envoyer un message
app.post('/api/messages', async (req, res) => {
    const { auteur, texte, type, dest, exp, vocal, vocal_dur } = req.body;
    const id = Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    
    try {
        const { error } = await supabase
            .from('messages')
            .insert({
                id, auteur, texte, type, dest: dest || null,
                exp: exp || null, vocal: vocal || null, vocal_dur: vocal_dur || null,
                likes: '[]'
            });
        
        if (error) throw error;
        res.json({ id, success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Tous les utilisateurs
app.get('/api/users', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('pseudo, photo, amis');
        
        if (error) throw error;
        res.json(data.map(u => ({ ...u, amis: JSON.parse(u.amis || '[]') })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Utilisateur spécifique
app.get('/api/users/:pseudo', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('pseudo, photo, amis')
            .eq('pseudo', req.params.pseudo)
            .single();
        
        if (error) throw error;
        if (data) data.amis = JSON.parse(data.amis || '[]');
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mettre à jour un utilisateur
app.put('/api/users/:pseudo', async (req, res) => {
    const { amis, photo, notifications } = req.body;
    try {
        const updates = {};
        if (amis !== undefined) updates.amis = JSON.stringify(amis);
        if (photo !== undefined) updates.photo = photo;
        if (notifications !== undefined) updates.notifications = JSON.stringify(notifications);
        
        const { error } = await supabase
            .from('users')
            .update(updates)
            .eq('pseudo', req.params.pseudo);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Publications
app.get('/api/publications', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('publications')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) throw error;
        res.json(data.map(p => ({
            ...p,
            likes: JSON.parse(p.likes || '[]'),
            comments: JSON.parse(p.comments || '[]')
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/publications', async (req, res) => {
    const { auteur, texte, img } = req.body;
    const id = 'p_' + Date.now();
    try {
        const { error } = await supabase
            .from('publications')
            .insert({
                id, auteur, texte: texte || '', img: img || null,
                likes: '[]', comments: '[]'
            });
        
        if (error) throw error;
        res.json({ id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/publications/:id/like', async (req, res) => {
    const { userId } = req.body;
    try {
        const { data: pub } = await supabase
            .from('publications')
            .select('likes')
            .eq('id', req.params.id)
            .single();
        
        if (!pub) return res.status(404).json({ error: 'Publication non trouvée' });
        
        let likes = JSON.parse(pub.likes || '[]');
        if (likes.includes(userId)) {
            likes = likes.filter(l => l !== userId);
        } else {
            likes.push(userId);
        }
        
        const { error } = await supabase
            .from('publications')
            .update({ likes: JSON.stringify(likes) })
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/publications/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('publications')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Groupes
app.get('/api/groupes', async (req, res) => {
    try {
        const { data, error } = await supabase.from('groupes').select('*');
        if (error) throw error;
        res.json(data.map(g => ({ ...g, membres: JSON.parse(g.membres || '[]') })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/groupes', async (req, res) => {
    const { nom, photo, membres } = req.body;
    const id = 'g_' + Date.now();
    try {
        const { error } = await supabase
            .from('groupes')
            .insert({
                id, nom, photo: photo || null,
                membres: JSON.stringify(membres)
            });
        
        if (error) throw error;
        res.json({ id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Vidéos
app.post('/api/videos', async (req, res) => {
    const { id, auteur, title, description, data } = req.body;
    try {
        const { error } = await supabase
            .from('videos')
            .insert({
                id, auteur, title: title || '', description: description || '',
                likes: '[]', dislikes: '[]', comments: '[]', data: data || null
            });
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/videos', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('id, auteur, title, description, date, likes, dislikes, comments')
            .order('date', { ascending: false });
        
        if (error) throw error;
        res.json(data.map(v => ({
            ...v,
            likes: JSON.parse(v.likes || '[]'),
            dislikes: JSON.parse(v.dislikes || '[]'),
            comments: JSON.parse(v.comments || '[]')
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/videos/:id/data', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('videos')
            .select('data')
            .eq('id', req.params.id)
            .single();
        
        if (error) throw error;
        res.json({ data: data?.data || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/videos/:id/like', async (req, res) => {
    const { userId } = req.body;
    try {
        const { data: video } = await supabase
            .from('videos')
            .select('likes, dislikes')
            .eq('id', req.params.id)
            .single();
        
        if (!video) return res.status(404).json({ error: 'Vidéo non trouvée' });
        
        let likes = JSON.parse(video.likes || '[]');
        let dislikes = JSON.parse(video.dislikes || '[]');
        
        if (likes.includes(userId)) {
            likes = likes.filter(l => l !== userId);
        } else {
            likes.push(userId);
            dislikes = dislikes.filter(d => d !== userId);
        }
        
        const { error } = await supabase
            .from('videos')
            .update({ likes: JSON.stringify(likes), dislikes: JSON.stringify(dislikes) })
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/videos/:id', async (req, res) => {
    try {
        const { error } = await supabase
            .from('videos')
            .delete()
            .eq('id', req.params.id);
        
        if (error) throw error;
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Notifications
app.get('/api/notifications/:pseudo', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('notifications')
            .eq('pseudo', req.params.pseudo)
            .single();
        
        if (error) throw error;
        res.json(JSON.parse(data?.notifications || '[]'));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/notifications/:pseudo', async (req, res) => {
    try {
        const { data: user } = await supabase
            .from('users')
            .select('notifications')
            .eq('pseudo', req.params.pseudo)
            .single();
        
        let notifs = JSON.parse(user?.notifications || '[]');
        notifs.unshift(req.body);
        if (notifs.length > 50) notifs.pop();
        
        const { error } = await supabase
            .from('users')
            .update({ notifications: JSON.stringify(notifs) })
            .eq('pseudo', req.params.pseudo);
        
        if (error) throw error;
        res.json(notifs);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/notifications/:pseudo', async (req, res) => {
    try {
        const { error } = await supabase
            .from('users')
            .update({ notifications: JSON.stringify(req.body) })
            .eq('pseudo', req.params.pseudo);
        
        if (error) throw error;
        res.json(req.body);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Route principale - DOIT ÊTRE À LA FIN
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API non trouvée' });
    }
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});
