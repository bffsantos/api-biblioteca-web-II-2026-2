const { debug } = require('console');
const express = require('express'); // importa express
const Database = require('better-sqlite3') // importa sqlite

const app = express(); // Inicializa aplicação via express
app.use(express.json()); // Configura corpo da requisição para JSON

//Banco de dados improvisado
//let livros = [
//{ id: 1, titulo: 'Dom Casmurro', autor: 'Machado de Assis', ano: 1899},
//{ id: 2, titulo: 'O Cortiço', autor: 'Aluísio Azevedo', ano: 1890}
//];
//let proximoId = 3; // variável de controle de ID do banco

// 'Banco de dados'
//const ARQUIVO = './livros.json'

const db = new Database('biblioteca.db');

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS livros (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    autor TEXT NOT NULL,
    ano INTEGER,
    exemplares INTEGER NOT NULL DEFAULT 1  -- quantas licenças do e-book a biblioteca tem
  );

  CREATE TABLE IF NOT EXISTS emprestimos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    livro_id INTEGER NOT NULL REFERENCES livros(id) ON DELETE CASCADE,
    leitor TEXT NOT NULL,
    data_emprestimo TEXT NOT NULL,
    data_devolucao_prevista TEXT NOT NULL,
    data_devolucao TEXT  -- NULL = o livro ainda está com o leitor
  );
`);

// Livros de exemplo, cadastrados só se a tabela estiver vazia
const { total } = db.prepare('SELECT COUNT(*) AS total FROM livros').get();

if (total === 0) {
  const inserir = db.prepare(
    'INSERT INTO livros (titulo, autor, ano, exemplares) VALUES (?, ?, ?, ?)'
  );
  inserir.run('Dom Casmurro', 'Machado de Assis', 1899, 2);
  inserir.run('O Cortiço', 'Aluísio Azevedo', 1890, 1);
  inserir.run('Iracema', 'José de Alencar', 1865, 3);
}

// =====================================================================
// REGRAS DA BIBLIOTECA
// =====================================================================
const LIMITE_POR_LEITOR = 3; // máximo de empréstimos ativos por leitor
const PRAZO_DIAS = 14;       // prazo de devolução

// Transforma uma data no formato AAAA-MM-DD (ex.: 2026-11-16)
function formatarData(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/*function lerLivros(){
    const conteudo = fs.readFileSync(ARQUIVO, 'utf-8');
    return JSON.parse(conteudo);
}

function salvarLivros(livros){
    fs.writeFileSync(ARQUIVO, JSON.stringify(livros, null, 2))
}*/

// Rota Home page
app.get('/', (req, res) => { res.send('Biblioteca API iniciada!')});

// Lista todos os livros
app.get('/livros', (req, res) => {
    const livros = db.prepare('SELECT * FROM livros').all();
    res.json(livros);
});

app.get('/livros/:id', (req, res) => {
    const livro = db.prepare('SELECT * FROM livros WHERE id = ?').get(req.params.id);

    if(!livro){
        return res.status(404).json('Livro não encontrado');
    }

    res.json(livro);
})

// Criar um livro
app.post('/livros', (req, res) => {
    var { titulo, autor, ano } = req.body;

    const resultado = db.prepare('INSERT INTO livros (titulo, autor, ano) VALUES(?, ?, ?)').run(titulo, autor, ano ?? null);
    
    const novoLivro = db.prepare('SELECT * FROM livros WHERE id = ?').get(resultado.lastInsertRowid);

    res.status(201).json(novoLivro);
})

app.delete('/livros/:id', (req, res) => {
    const resultado = db.prepare('DELETE FROM livros WHERE id = ?').run(req.params.id);

    if(resultado.changes === 0) {
        return res.status(404).json({erro: 'Livro não encontrado'});
    }

    res.status(204).send();
})

app.post('/emprestimos', (req, res) => {
  const { livroId, leitor } = req.body;

  // Regra 1: dados obrigatórios -> 400
  if (!livroId || !leitor) {
    return res.status(400).json({ erro: 'livroId e leitor são obrigatórios' });
  }

  // Regra 2: o livro precisa existir -> 404
  const livro = db.prepare('SELECT * FROM livros WHERE id = ?').get(livroId);

  if (!livro) {
    return res.status(404).json({ erro: 'Livro não encontrado' });
  }

  // Regra 3: precisa haver licença disponível -> 409
  const { ativosDoLivro } = db
    .prepare('SELECT COUNT(*) AS ativosDoLivro FROM emprestimos WHERE livro_id = ? AND data_devolucao IS NULL')
    .get(livroId);

  if (ativosDoLivro >= livro.exemplares) {
    return res.status(409).json({ erro: 'Não há exemplares disponíveis deste livro' });
  }

  // Regra 4: cada leitor pode ter no máximo 3 empréstimos ativos -> 409
  const { ativosDoLeitor } = db
    .prepare('SELECT COUNT(*) AS ativosDoLeitor FROM emprestimos WHERE leitor = ? AND data_devolucao IS NULL')
    .get(leitor);

  if (ativosDoLeitor >= LIMITE_POR_LEITOR) {
    return res.status(409).json({ erro: `Leitor já atingiu o limite de ${LIMITE_POR_LEITOR} empréstimos` });
  }

  // Regra 5: o prazo é calculado pela API (hoje + 14 dias)
  const hoje = new Date();
  const prazo = new Date();
  prazo.setDate(prazo.getDate() + PRAZO_DIAS);

  const resultado = db
    .prepare(`INSERT INTO emprestimos (livro_id, leitor, data_emprestimo, data_devolucao_prevista)
              VALUES (?, ?, ?, ?)`)
    .run(livroId, leitor, formatarData(hoje), formatarData(prazo));

  const emprestimo = db
    .prepare('SELECT * FROM emprestimos WHERE id = ?')
    .get(resultado.lastInsertRowid);

  /*const livroAlterado = db
    .prepare('UPDATE livros SET exemplares = ? WHERE id = ?')
    .run(livro.exemplares - 1, livroId);*/

  res.status(201).json(emprestimo);
});

// Inicialiação da aplicação na porta 3000
app.listen(3000, () => {console.log('Servidor rodando em http://localhost:3000')})


