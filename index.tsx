import React, { useState, useEffect, useMemo, FormEvent, ChangeEvent } from 'react';
import { createRoot } from 'react-dom/client';

// --- 데이터 구조 정의 ---
interface Member {
  id: number;
  name: string;
  position: string;
}

interface Transaction {
  id: number;
  type: 'income' | 'expense';
  date: string;
  category: string;
  amount: number;
  memberId?: number;
  memo?: string;
}

// --- 상수 정의 ---
const POSITIONS = ["목사", "사모", "부목사", "전도사", "장로", "권사", "집사", "성도", "청년", "중고등부", "주일학교", "무명", "기타"];
const INCOME_CATEGORIES = ["십일조", "감사헌금", "건축헌금", "선교헌금", "주정헌금", "절기헌금", "생일감사", "심방감사", "일천번제", "기타"];
const todayString = () => new Date().toISOString().slice(0, 10);

// --- LocalStorage를 위한 커스텀 Hook ---
function usePersistentState<T>(key: string, defaultValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(() => {
    try {
      const storedValue = localStorage.getItem(key);
      return storedValue ? JSON.parse(storedValue) : defaultValue;
    } catch (error) {
      console.error(`localStorage 읽기 오류 “${key}”:`, error);
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (error) {
      console.error(`localStorage 쓰기 오류 “${key}”:`, error);
    }
  }, [key, state]);

  return [state, setState];
}

const PasswordModal: React.FC<{
  mode: 'create' | 'enter';
  onClose: () => void;
  onConfirm: (password: string) => void;
}> = ({ mode, onClose, onConfirm }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^\d{4}$/.test(password)) {
      setError('비밀번호는 4자리 숫자여야 합니다.');
      return;
    }

    if (mode === 'create' && password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }
    
    onConfirm(password);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button onClick={onClose} className="close-btn">&times;</button>
        <h2>{mode === 'create' ? '비밀번호 설정' : '비밀번호 입력'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password-input">{mode === 'create' ? '새 비밀번호 (4자리 숫자)' : '비밀번호'}</label>
            <input
              id="password-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              maxLength={4}
              inputMode="numeric"
              autoComplete="new-password"
              required
              autoFocus
            />
          </div>
          {mode === 'create' && (
            <div className="form-group">
              <label htmlFor="confirm-password-input">비밀번호 확인</label>
              <input
                id="confirm-password-input"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                maxLength={4}
                inputMode="numeric"
                autoComplete="new-password"
                required
              />
            </div>
          )}
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="submit-btn full-width">확인</button>
        </form>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [view, setView] = useState<'main' | 'addMember' | 'search'>('main');
  const [activeTab, setActiveTab] = useState<'income' | 'expense'>('income');
  
  const [members, setMembers] = usePersistentState<Member[]>('church_members_v2', []);
  const [transactions, setTransactions] = usePersistentState<Transaction[]>('church_transactions_v2', []);
  const [expenseCategories, setExpenseCategories] = usePersistentState<string[]>('church_expense_categories_v2', ['운영비', '선교비', '구제비']);
  const [password, setPassword] = usePersistentState<string | null>('church_app_password_v2', null);

  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordModalProps, setPasswordModalProps] = useState({
      mode: 'enter' as 'create' | 'enter',
      onConfirm: (pw: string) => {},
      onClose: () => setShowPasswordModal(false)
  });

  // --- 새 성도 추가 핸들러 ---
  const handleAddMember = (name: string, position: string) => {
    if (!name.trim()) {
        alert("성도 이름을 입력해주세요.");
        return;
    }
    const newMember: Member = { id: Date.now(), name, position };
    setMembers(prev => [...prev, newMember].sort((a, b) => a.name.localeCompare(b.name, 'ko')));
    setView('main');
  };

  // --- 새 거래 추가 핸들러 ---
  const handleAddTransaction = (tx: Omit<Transaction, 'id'>) => {
    setTransactions(prev => [...prev, { ...tx, id: Date.now() }]);
  };
  
  // --- 새 지출 항목 추가 핸들러 ---
  const handleAddExpenseCategory = (category: string) => {
    if (category && !expenseCategories.includes(category)) {
      setExpenseCategories(prev => [...prev, category]);
    }
  };
  
  // --- 비밀번호 보호 작업 실행기 ---
  const runProtectedAction = (action: () => void) => {
    if (password) {
      setPasswordModalProps({
        mode: 'enter',
        onConfirm: (enteredPassword) => {
          if (enteredPassword === password) {
            setShowPasswordModal(false);
            action();
          } else {
            alert('비밀번호가 올바르지 않습니다.');
          }
        },
        onClose: () => setShowPasswordModal(false)
      });
    } else {
      setPasswordModalProps({
        mode: 'create',
        onConfirm: (newPassword) => {
          setPassword(newPassword);
          setShowPasswordModal(false);
          action();
        },
        onClose: () => setShowPasswordModal(false)
      });
    }
    setShowPasswordModal(true);
  };

  // --- 데이터 저장/불러오기 핸들러 ---
  const handleSaveData = () => {
    const performSave = () => {
        try {
            const dataToSave = { members, transactions, expenseCategories };
            const jsonString = JSON.stringify(dataToSave, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `church_data_backup_${todayString()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert('데이터를 성공적으로 저장했습니다.');
        } catch (error) {
            console.error('데이터 저장 오류:', error);
            alert('데이터 저장 중 오류가 발생했습니다.');
        }
    };
    runProtectedAction(performSave);
  };

  const handleLoadData = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const inputElement = event.target;

    const performLoad = () => {
        if (!window.confirm('데이터를 불러오면 현재 데이터가 모두 덮어쓰여집니다. 계속하시겠습니까?')) {
            inputElement.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const text = e.target?.result;
                if (typeof text !== 'string') throw new Error("파일을 읽을 수 없습니다.");
                const parsedData = JSON.parse(text);
                
                if (parsedData.members && parsedData.transactions && parsedData.expenseCategories) {
                    setMembers(parsedData.members);
                    setTransactions(parsedData.transactions);
                    setExpenseCategories(parsedData.expenseCategories);
                    alert('데이터를 성공적으로 불러왔습니다.');
                } else {
                    alert('유효하지 않은 데이터 파일입니다.');
                }
            } catch (error) {
                console.error("데이터 불러오기 오류:", error);
                alert('데이터를 불러오는 중 오류가 발생했습니다.');
            } finally {
                inputElement.value = '';
            }
        };
        reader.readAsText(file);
    };
    runProtectedAction(performLoad);
  };
  
  // --- 계산 로직 (useMemo로 최적화) ---
  const { sortedTransactions, balanceData, periodicalSummary, weeklyCategoryTotals, transactionsWithBalance } = useMemo(() => {
    const sorted = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id);
    
    const todayStr = todayString();
    let previousBalance = 0;
    let todaysChange = 0;

    transactions.forEach(tx => {
        const amount = tx.type === 'income' ? tx.amount : -tx.amount;
        if (tx.date < todayStr) {
            previousBalance += amount;
        } else if (tx.date === todayStr) {
            todaysChange += amount;
        }
    });

    const todaysBalance = previousBalance + todaysChange;
    
    let runningBalance = 0;
    const withBalance = [...transactions]
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || a.id - b.id)
        .map(tx => {
            runningBalance += (tx.type === 'income' ? tx.amount : -tx.amount);
            return { ...tx, balance: runningBalance };
        })
        .reverse();
        
    const today = new Date(todayStr);
    const yearStartStr = today.getFullYear() + '-01-01';
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - today.getDay()); // 0: Sunday
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    let weeklyIncome = 0;
    let weeklyExpense = 0;
    let yearlyIncome = 0;
    let yearlyExpense = 0;
    
    const gyeongsangbiCategories = ["주정헌금", "십일조", "감사헌금", "생일감사", "심방감사", "일천번제"];
    const weeklyGyeongsangbiBreakdown: { [key: string]: number } = Object.fromEntries(
        gyeongsangbiCategories.map(cat => [cat, 0])
    );
    let weeklySeongyo = 0;
    let weeklyGeonchuk = 0;
    
    transactions.forEach(tx => {
        const amount = tx.amount;
        if (tx.date >= yearStartStr) {
            if (tx.type === 'income') yearlyIncome += amount;
            else yearlyExpense += amount;
        }
        if (tx.date >= weekStartStr) {
            if (tx.type === 'income') {
                weeklyIncome += amount;
                if (gyeongsangbiCategories.includes(tx.category)) {
                    weeklyGyeongsangbiBreakdown[tx.category] += amount;
                } else if (tx.category === '선교헌금') {
                    weeklySeongyo += amount;
                } else if (tx.category === '건축헌금') {
                    weeklyGeonchuk += amount;
                }
            } else {
                weeklyExpense += amount;
            }
        }
    });

    return {
      sortedTransactions: sorted,
      balanceData: { previousBalance, todaysChange, todaysBalance },
      periodicalSummary: {
          weeklyIncome,
          weeklyExpense,
          yearlyIncome,
          yearlyExpense,
          weeklyBalance: weeklyIncome - weeklyExpense,
          yearlyBalance: yearlyIncome - yearlyExpense,
      },
      weeklyCategoryTotals: {
          weeklyGyeongsangbiBreakdown,
          weeklySeongyo,
          weeklyGeonchuk
      },
      transactionsWithBalance: withBalance,
    };
  }, [transactions]);
  
  const getMemberName = (id?: number) => members.find(m => m.id === id)?.name || '미지정';

  return (
    <>
      <header>
        <h1>문성교회 헌금관리</h1>
        <div className="header-actions">
            <button onClick={() => setView('addMember')}>새 성도 추가</button>
            <button onClick={() => setView('search')}>조회</button>
        </div>
      </header>
      <main>
        {view === 'main' && (
          <>
            <div className="card">
              <div className="tabs">
                <button className={`tab-button ${activeTab === 'income' ? 'active' : ''}`} onClick={() => setActiveTab('income')}>입금</button>
                <button className={`tab-button ${activeTab === 'expense' ? 'active' : ''}`} onClick={() => setActiveTab('expense')}>출금</button>
              </div>
              {activeTab === 'income' ? (
                <IncomeForm members={members} onAddTransaction={handleAddTransaction} />
              ) : (
                <ExpenseForm members={members} categories={expenseCategories} onAddCategory={handleAddExpenseCategory} onAddTransaction={handleAddTransaction} />
              )}
            </div>
            <PeriodicalSummary {...periodicalSummary} />
            <WeeklyCategorySummary {...weeklyCategoryTotals} />
            <BalanceSummary {...balanceData} />
            <TransactionList 
              transactions={transactionsWithBalance} 
              getMemberName={getMemberName}
              onSaveData={handleSaveData}
              onLoadData={handleLoadData}
            />
          </>
        )}
        {view === 'addMember' && <AddMemberModal onAddMember={handleAddMember} onClose={() => setView('main')} />}
        {view === 'search' && <SearchModal transactions={transactions} members={members} getMemberName={getMemberName} incomeCategories={INCOME_CATEGORIES} expenseCategories={expenseCategories} onClose={() => setView('main')} />}
        {showPasswordModal && <PasswordModal {...passwordModalProps} />}
      </main>
    </>
  );
};

// --- 컴포넌트들 ---

const WeeklyCategorySummary: React.FC<{
  weeklyGyeongsangbiBreakdown: { [key: string]: number };
  weeklySeongyo: number;
  weeklyGeonchuk: number;
}> = ({ weeklyGyeongsangbiBreakdown, weeklySeongyo, weeklyGeonchuk }) => (
  <section className="card periodical-summary category-breakdown-summary">
    <div className="summary-row">
      <span className="row-label">경상비</span>
      <div className="row-values gyeongsangbi">
        {Object.entries(weeklyGyeongsangbiBreakdown).map(([category, amount]) => (
            <div className="value-item" key={category}>
              <span className="value-label">{category}</span>
              <span className="value-amount">{amount.toLocaleString()}원</span>
            </div>
        ))}
      </div>
    </div>
    <div className="summary-row">
      <span className="row-label">특별헌금</span>
      <div className="row-values">
        <div className="value-item">
          <span className="value-label">선교헌금</span>
          <span className="value-amount">{weeklySeongyo.toLocaleString()}원</span>
        </div>
        <div className="value-item">
          <span className="value-label">건축헌금</span>
          <span className="value-amount">{weeklyGeonchuk.toLocaleString()}원</span>
        </div>
      </div>
    </div>
  </section>
);

const PeriodicalSummary: React.FC<{
  weeklyIncome: number;
  weeklyExpense: number;
  yearlyIncome: number;
  yearlyExpense: number;
  weeklyBalance: number;
  yearlyBalance: number;
}> = ({ weeklyIncome, weeklyExpense, yearlyIncome, yearlyExpense, weeklyBalance, yearlyBalance }) => (
  <section className="card periodical-summary">
    <div className="summary-row">
      <span className="row-label income-color">수입</span>
      <div className="row-values">
        <div className="value-item">
          <span className="value-label">금주 총액</span>
          <span className="value-amount">{weeklyIncome.toLocaleString()}원</span>
        </div>
        <div className="value-item">
          <span className="value-label">금년 총액</span>
          <span className="value-amount">{yearlyIncome.toLocaleString()}원</span>
        </div>
      </div>
    </div>
    <div className="summary-row">
      <span className="row-label expense-color">지출</span>
      <div className="row-values">
        <div className="value-item">
          <span className="value-label">금주 총액</span>
          <span className="value-amount">{weeklyExpense.toLocaleString()}원</span>
        </div>
        <div className="value-item">
          <span className="value-label">금년 총액</span>
          <span className="value-amount">{yearlyExpense.toLocaleString()}원</span>
        </div>
      </div>
    </div>
    <div className="summary-row">
      <span className="row-label">잔액</span>
      <div className="row-values">
        <div className="value-item">
          <span className="value-label">금주 잔액</span>
          <span className="value-amount">{weeklyBalance.toLocaleString()}원</span>
        </div>
        <div className="value-item">
          <span className="value-label">금년 잔액</span>
          <span className="value-amount">{yearlyBalance.toLocaleString()}원</span>
        </div>
      </div>
    </div>
  </section>
);

const BalanceSummary: React.FC<{previousBalance: number, todaysChange: number, todaysBalance: number}> = ({ previousBalance, todaysChange, todaysBalance }) => (
  <section className="balance-summary">
    <div className="summary-item">
      <span className="summary-label">이전 잔액</span>
      <span className="summary-value">{previousBalance.toLocaleString()}원</span>
    </div>
    <div className="summary-item">
      <span className="summary-label">오늘 변동금액</span>
      <span className={`summary-value ${todaysChange >= 0 ? 'income-color' : 'expense-color'}`}>{todaysChange.toLocaleString()}원</span>
    </div>
    <div className="summary-item">
      <span className="summary-label">금일 잔액</span>
      <span className="summary-value bold">{todaysBalance.toLocaleString()}원</span>
    </div>
  </section>
);

const IncomeForm: React.FC<{members: Member[], onAddTransaction: (tx: Omit<Transaction, 'id'>) => void}> = ({ members, onAddTransaction }) => {
  const [date, setDate] = useState(todayString);
  const [category, setCategory] = useState(INCOME_CATEGORIES[0]);
  const [memberId, setMemberId] = useState<number | ''>('');
  const [amount, setAmount] = useState<number | ''>('');

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (amount === '' || amount <= 0 || memberId === '') {
      alert('모든 필수 항목을 입력해주세요.');
      return;
    }
    onAddTransaction({ type: 'income', date, category, amount, memberId: Number(memberId) });
    setMemberId('');
    setAmount('');
  };

  return (
    <form onSubmit={handleSubmit} className="transaction-form">
      <div className="form-group">
        <label htmlFor="income-date">입금 날짜</label>
        <input id="income-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>
      <div className="form-group">
        <label htmlFor="income-category">입금 내역</label>
        <select id="income-category" value={category} onChange={e => setCategory(e.target.value)}>
          {INCOME_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="income-member">헌금자</label>
        <select id="income-member" value={memberId} onChange={e => setMemberId(Number(e.target.value))} required>
          <option value="" disabled>-- 성도 선택 --</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.position})</option>)}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="income-amount">금액 (원)</label>
        <input id="income-amount" type="number" placeholder="숫자만 입력" value={amount} onChange={e => setAmount(Number(e.target.value))} required min="1" />
      </div>
      <button type="submit" className="submit-btn">등록 완료</button>
    </form>
  );
};

const ExpenseForm: React.FC<{members: Member[], categories: string[], onAddCategory: (cat: string) => void, onAddTransaction: (tx: Omit<Transaction, 'id'>) => void}> = ({ members, categories, onAddCategory, onAddTransaction }) => {
  const [date, setDate] = useState(todayString);
  const [category, setCategory] = useState(categories[0] || '');
  const [memberId, setMemberId] = useState<number | ''>('');
  const [amount, setAmount] = useState<number | ''>('');
  const [memo, setMemo] = useState('');
  
  const handleAddCategory = () => {
    const newCategory = prompt('추가할 출금 항목 이름을 입력하세요:');
    if (newCategory) onAddCategory(newCategory.trim());
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (amount === '' || amount <= 0 || !category) {
      alert('출금 내역과 금액을 정확히 입력해주세요.');
      return;
    }
    onAddTransaction({ type: 'expense', date, category, amount, memberId: memberId === '' ? undefined : Number(memberId), memo });
    setMemberId('');
    setAmount('');
    setMemo('');
  };

  return (
    <form onSubmit={handleSubmit} className="transaction-form">
      <div className="form-group">
        <label htmlFor="expense-date">출금 날짜</label>
        <input id="expense-date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
      </div>
      <div className="form-group">
        <label htmlFor="expense-category">출금 내역</label>
        <div className="category-input">
          <select id="expense-category" value={category} onChange={e => setCategory(e.target.value)} required>
            <option value="" disabled>-- 항목 선택 --</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={handleAddCategory} className="add-category-btn">+</button>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="expense-user">사용자</label>
        <select id="expense-user" value={memberId} onChange={e => setMemberId(Number(e.target.value))}>
          <option value="">-- 선택 사항 --</option>
          {members.map(m => <option key={m.id} value={m.id}>{m.name} ({m.position})</option>)}
        </select>
      </div>
      <div className="form-group">
        <label htmlFor="expense-amount">금액 (원)</label>
        <input id="expense-amount" type="number" placeholder="숫자만 입력" value={amount} onChange={e => setAmount(Number(e.target.value))} required min="1" />
      </div>
      <div className="form-group">
        <label htmlFor="expense-memo">비고</label>
        <input id="expense-memo" type="text" value={memo} onChange={e => setMemo(e.target.value)} placeholder="메모 (선택사항)" />
      </div>
      <button type="submit" className="submit-btn">등록</button>
    </form>
  );
};

const TransactionList: React.FC<{
  transactions: (Transaction & {balance: number})[], 
  getMemberName: (id?: number) => string,
  onSaveData: () => void,
  onLoadData: (event: ChangeEvent<HTMLInputElement>) => void
}> = ({ transactions, getMemberName, onSaveData, onLoadData }) => (
  <section className="card">
    <h2>거래 내역</h2>
    <div className="transaction-list">
      <div className="transaction-header">
        <span>날짜</span>
        <span>입금</span>
        <span>출금</span>
        <span>금액</span>
        <span>잔액</span>
      </div>
      {transactions.length === 0 ? (
        <p className="empty-list">거래 내역이 없습니다.</p>
      ) : (
        transactions.map(tx => (
          <div key={tx.id} className={`transaction-item ${tx.type}`}>
            <span>{tx.date}</span>
            <span>{tx.type === 'income' ? `${getMemberName(tx.memberId)} (${tx.category})` : '-'}</span>
            <span>{tx.type === 'expense' ? tx.category : '-'}</span>
            <span className={tx.type === 'income' ? 'income-color' : 'expense-color'}>{tx.amount.toLocaleString()}원</span>
            <span>{tx.balance.toLocaleString()}원</span>
          </div>
        ))
      )}
    </div>
    <div className="data-management">
      <button onClick={onSaveData} className="data-btn">데이터 저장</button>
      <label htmlFor="load-data-input" className="data-btn">
        데이터 불러오기
      </label>
      <input 
        id="load-data-input"
        type="file"
        accept=".json"
        onChange={onLoadData}
        style={{ display: 'none' }}
      />
    </div>
  </section>
);

const AddMemberModal: React.FC<{onAddMember: (name: string, position: string) => void, onClose: () => void}> = ({ onAddMember, onClose }) => {
  const [name, setName] = useState('');
  const [position, setPosition] = useState(POSITIONS[0]);
  
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onAddMember(name, position);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button onClick={onClose} className="close-btn">&times;</button>
        <h2>새 성도 추가</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="new-member-name">이름</label>
            <input id="new-member-name" type="text" value={name} onChange={e => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label htmlFor="new-member-position">직분</label>
            <select id="new-member-position" value={position} onChange={e => setPosition(e.target.value)}>
              {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <button type="submit" className="submit-btn">추가</button>
        </form>
      </div>
    </div>
  );
};

const SearchModal: React.FC<{
    transactions: Transaction[], 
    members: Member[], 
    getMemberName: (id?: number) => string,
    incomeCategories: string[],
    expenseCategories: string[],
    onClose: () => void
}> = ({ transactions, members, getMemberName, incomeCategories, expenseCategories, onClose }) => {
    const [searchType, setSearchType] = useState<'name' | 'category'>('name');
    const [nameQuery, setNameQuery] = useState<number | ''>('');
    
    const [categoryType, setCategoryType] = useState<'income' | 'expense'>('income');
    const [categoryQuery, setCategoryQuery] = useState('');

    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - 1);
        return d.toISOString().slice(0, 10);
    });
    const [endDate, setEndDate] = useState(todayString);

    const filteredTransactions = useMemo(() => {
        return transactions.filter(tx => tx.date >= startDate && tx.date <= endDate);
    }, [transactions, startDate, endDate]);

    const todaysTotals = useMemo(() => {
        const today = todayString();
        const todaysTransactions = transactions.filter(tx => tx.date === today);
        
        const totalIncome = todaysTransactions
            .filter(tx => tx.type === 'income')
            .reduce((sum, tx) => sum + tx.amount, 0);

        const totalExpense = todaysTransactions
            .filter(tx => tx.type === 'expense')
            .reduce((sum, tx) => sum + tx.amount, 0);
            
        return { totalIncome, totalExpense };
    }, [transactions]);

    const nameSearchResult = useMemo(() => {
        if (searchType !== 'name' || nameQuery === '') return null;
        const result = filteredTransactions.filter(tx => tx.memberId === nameQuery && tx.type === 'income');
        const total = result.reduce((sum, tx) => sum + tx.amount, 0);
        return { transactions: result, total };
    }, [filteredTransactions, searchType, nameQuery]);

    const categorySearchResult = useMemo(() => {
        if (searchType !== 'category' || categoryQuery === '') return null;
        const result = filteredTransactions.filter(tx => tx.type === categoryType && tx.category === categoryQuery);
        const total = result.reduce((sum, tx) => sum + tx.amount, 0);
        return { transactions: result, total };
    }, [filteredTransactions, searchType, categoryType, categoryQuery]);

    return (
        <div className="modal-backdrop">
            <div className="modal-content large">
                <button onClick={onClose} className="close-btn">&times;</button>
                <h2>조회</h2>
                <div className="search-controls">
                    <div className="form-group date-range">
                        <label>기간 설정:</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                        <span>~</span>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                    </div>
                    <div className="tabs">
                        <button className={`tab-button ${searchType === 'name' ? 'active' : ''}`} onClick={() => setSearchType('name')}>이름 조회</button>
                        <button className={`tab-button ${searchType === 'category' ? 'active' : ''}`} onClick={() => setSearchType('category')}>항목별 조회</button>
                    </div>

                    {searchType === 'name' && (
                        <div className="form-group">
                            <label>이름:</label>
                            <select value={nameQuery} onChange={e => setNameQuery(Number(e.target.value))}>
                                <option value="" disabled>-- 성도 선택 --</option>
                                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                    )}
                    {searchType === 'category' && (
                        <div className="category-search-container">
                            <div className="category-search-group">
                                <select value={categoryType} onChange={e => { setCategoryType(e.target.value as 'income' | 'expense'); setCategoryQuery(''); }}>
                                    <option value="income">입금</option>
                                    <option value="expense">출금</option>
                                </select>
                                <select value={categoryQuery} onChange={e => setCategoryQuery(e.target.value)}>
                                    <option value="" disabled>-- 항목 선택 --</option>
                                    {(categoryType === 'income' ? incomeCategories : expenseCategories).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="today-totals-summary">
                                <div>
                                    <span>오늘의 입금 총액</span>
                                    <span className="income-color">{todaysTotals.totalIncome.toLocaleString()}원</span>
                                </div>
                                <div>
                                    <span>오늘의 출금 총액</span>
                                    <span className="expense-color">{todaysTotals.totalExpense.toLocaleString()}원</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
                <div className="search-results">
                    {nameSearchResult && (
                        <>
                            <h3>{getMemberName(nameQuery)}님 헌금 내역 (총: {nameSearchResult.total.toLocaleString()}원)</h3>
                            <ul>{nameSearchResult.transactions.map(tx => <li key={tx.id}>{tx.date} | {tx.category}: {tx.amount.toLocaleString()}원</li>)}</ul>
                        </>
                    )}
                    {categorySearchResult && (
                        <>
                           <h3>{categoryQuery} 내역 (총: {categorySearchResult.total.toLocaleString()}원)</h3>
                           <ul>{categorySearchResult.transactions.map(tx => <li key={tx.id}>{tx.date} | {tx.type === 'income' ? getMemberName(tx.memberId) : (tx.memo || '메모 없음')}: {tx.amount.toLocaleString()}원</li>)}</ul>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(<App />);