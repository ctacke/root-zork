/**
 * Z-Machine Version 3 Interpreter Engine
 * Supports Zork I, Zork II, Zork III and other v3 interactive fiction story files.
 * Provides generator-based execution, full state serialization/deserialization,
 * status line interception, and in-memory quicksaving.
 */

export interface CallFrame {
  ds: number[];
  pc: number;
  local: Int16Array;
}

export interface StatusLineData {
  location: string;
  scoreOrHours: number;
  movesOrMinutes: number;
  statusType: 'score' | 'time';
}

export interface ZExecutionResult {
  output: string;
  isWaitingForInput: boolean;
  isGameOver: boolean;
  status: StatusLineData;
}

export class ZMachineEngine {
  public memInit: Uint8Array;
  public mem: Uint8Array;
  public view: DataView;
  public byteSwapped: boolean = false;
  public statusType: boolean = false; // false = score/moves, true = hours/minutes
  public serial: string = '';
  public zorkid: number = 0;
  public endText: number = 0;
  public fwords: number = 0;
  public savedFlags: number = 0;
  public selfInsertingBreaks: string | null = null;
  public vocabulary: Map<string, number> | null = null;
  public regBreak: RegExp | null = null;
  public isTandy: boolean = false;
  public seed: number = 0;

  // Active execution state
  private gen: Generator<any, void, any> | null = null;
  private currentOutputBuffer: string = '';
  public currentStatus: StatusLineData = {
    location: '',
    scoreOrHours: 0,
    movesOrMinutes: 0,
    statusType: 'score'
  };
  private nextInputString: string = '';
  private lastSavedBuffer: Uint8Array | null = null;

  // Snapshotted VM registers during read wait
  public activePc: number = 0;
  public activeCs: CallFrame[] = [];
  public activeDs: number[] = [];

  constructor(storyBuffer: Uint8Array | Buffer) {
    this.memInit = new Uint8Array(storyBuffer);
    this.mem = new Uint8Array(this.memInit);
    this.view = new DataView(this.mem.buffer, this.mem.byteOffset, this.mem.byteLength);

    if (this.memInit[0] !== 3) {
      throw new Error(`Unsupported Z-code version: ${this.memInit[0]}. Expected version 3.`);
    }
    this.byteSwapped = !!(this.memInit[1] & 1);
    this.statusType = !!(this.memInit[1] & 2);
    this.serial = String.fromCharCode(...this.memInit.slice(18, 24));
    this.zorkid =
      (this.memInit[2] << (this.byteSwapped ? 0 : 8)) |
      (this.memInit[3] << (this.byteSwapped ? 8 : 0));
    this.currentStatus.statusType = this.statusType ? 'time' : 'score';
  }

  public get(x: number): number {
    return this.view.getInt16(x, this.byteSwapped);
  }

  public getu(x: number): number {
    return this.view.getUint16(x, this.byteSwapped);
  }

  public put(x: number, y: number): void {
    this.view.setInt16(x, y, this.byteSwapped);
  }

  public putu(x: number, y: number): void {
    this.view.setUint16(x, y & 0xffff, this.byteSwapped);
  }

  public getText(addr: number): string {
    let o = '';
    let ps = 0;
    let ts = 0;
    let w: number;
    let y = 0;

    const d = (v: number) => {
      if (ts === 3) {
        y = v << 5;
        ts = 4;
      } else if (ts === 4) {
        y += v;
        if (y === 13) o += '\n';
        else if (y) o += String.fromCharCode(y);
        ts = ps;
      } else if (ts === 5) {
        o += this.getText(this.getu(this.fwords + (y + v) * 2) * 2);
        ts = ps;
      } else if (v === 0) {
        o += ' ';
      } else if (v < 4) {
        ts = 5;
        y = (v - 1) * 32;
      } else if (v < 6) {
        if (!ts) ts = v - 3;
        else if (ts === v - 3) ps = ts;
        else ps = ts = 0;
      } else if (v === 6 && ts === 2) {
        ts = 3;
      } else {
        const charset =
          'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ*\n0123456789.,!?_#\'"/\\-:()';
        o += charset[ts * 26 + v - 6] || '';
        ts = ps;
      }
    };

    for (;;) {
      w = this.getu(addr);
      addr += 2;
      d((w >> 10) & 31);
      d((w >> 5) & 31);
      d(w & 31);
      if (w & 32768) break;
    }
    this.endText = addr;
    return o;
  }

  public parseVocab(s: number): void {
    this.vocabulary = new Map();
    if (s === 0) {
      this.regBreak = new RegExp('[^ \\n\\t]+', 'g');
      return;
    }

    let n = this.mem[s++];
    this.selfInsertingBreaks = String.fromCharCode(...this.mem.slice(s, s + n));
    const escBreaks = this.selfInsertingBreaks
      .split('')
      .map(x => (x.toUpperCase() === x.toLowerCase() ? '' : '\\') + x)
      .join('');
    this.regBreak = new RegExp('[' + escBreaks + ']|[^ \\n\\t' + escBreaks + ']+', 'g');
    s += n;
    const entryLen = this.mem[s++];
    let numEntries = this.get(s);
    s += 2;
    while (numEntries--) {
      this.vocabulary.set(this.getText(s), s);
      s += entryLen;
    }
  }

  public handleInput(userInput: string, maxlen: number, parseOffset: number): void {
    const textBuffer = this.mem;
    const inputChars = (userInput || '').toLowerCase();
    let charIdx = 0;

    for (; charIdx < inputChars.length && charIdx < maxlen - 1; charIdx++) {
      textBuffer[maxlen + 1 + charIdx] = inputChars.charCodeAt(charIdx);
    }
    textBuffer[maxlen + 1 + charIdx] = 0; // null-terminated

    if (parseOffset === 0) return;

    let p = parseOffset;
    const maxWords = this.mem[p++];
    let wordCount = 0;
    p++; // skip count byte for now

    if (this.regBreak) {
      this.regBreak.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = this.regBreak.exec(inputChars)) !== null && wordCount < maxWords) {
        let token = match[0];
        let tokenAddr = 0;

        for (let len = token.length; len > 0; len--) {
          const sub = token.substring(0, len);
          if (this.vocabulary?.has(sub)) {
            tokenAddr = this.vocabulary.get(sub) || 0;
            break;
          }
        }

        this.putu(p, tokenAddr);
        this.mem[p + 2] = token.length;
        this.mem[p + 3] = match.index + 1;
        p += 4;
        wordCount++;
      }
    }

    this.mem[parseOffset + 1] = wordCount;
  }

  public serialize(ds: number[], cs: CallFrame[], pc: number): Uint8Array {
    const purbot = (this.memInit[14] << (this.byteSwapped ? 0 : 8)) | (this.memInit[15] << (this.byteSwapped ? 8 : 0));
    let csSize = 2; // cs.length (uint16)
    for (let i = 0; i < cs.length; i++) {
      csSize += 4; // pc (uint32)
      csSize += 1; // local.length (uint8)
      csSize += cs[i].local.length * 2; // local array
      csSize += 2; // ds.length (uint16)
      csSize += cs[i].ds.length * 2; // ds array
    }
    const totalSize = purbot + 4 + 4 + 2 + ds.length * 2 + csSize;
    const ar = new Uint8Array(totalSize);
    ar.set(this.mem.subarray(0, purbot));

    const vi = new DataView(ar.buffer, ar.byteOffset, ar.byteLength);
    let offset = purbot;

    vi.setUint32(offset, pc); offset += 4;
    vi.setUint32(offset, this.seed >>> 0); offset += 4;

    vi.setUint16(offset, ds.length); offset += 2;
    for (let i = 0; i < ds.length; i++) {
      vi.setInt16(offset, ds[i]);
      offset += 2;
    }

    vi.setUint16(offset, cs.length); offset += 2;
    for (let i = 0; i < cs.length; i++) {
      vi.setUint32(offset, cs[i].pc); offset += 4;
      vi.setUint8(offset, cs[i].local.length); offset += 1;
      for (let j = 0; j < cs[i].local.length; j++) {
        vi.setInt16(offset, cs[i].local[j]);
        offset += 2;
      }
      vi.setUint16(offset, cs[i].ds.length); offset += 2;
      for (let j = 0; j < cs[i].ds.length; j++) {
        vi.setInt16(offset, cs[i].ds[j]);
        offset += 2;
      }
    }

    return ar;
  }

  public deserialize(ar: Uint8Array): { ds: number[]; cs: CallFrame[]; pc: number } | null {
    try {
      const purbot = (this.memInit[14] << (this.byteSwapped ? 0 : 8)) | (this.memInit[15] << (this.byteSwapped ? 8 : 0));
      if (!ar || ar.byteLength < purbot) return null;
      if (ar[2] !== this.memInit[2] || ar[3] !== this.memInit[3]) return null;

      // Restore dynamic memory from saved buffer
      this.mem = new Uint8Array(this.memInit);
      this.mem.set(ar.subarray(0, purbot));
      this.view = new DataView(this.mem.buffer, this.mem.byteOffset, this.mem.byteLength);

      const vi = new DataView(ar.buffer, ar.byteOffset, ar.byteLength);
      let offset = purbot;

      const hasBytes = (count: number) => offset + count <= vi.byteLength;

      let pc = this.getu(6);
      if (hasBytes(4)) {
        pc = vi.getUint32(offset);
        offset += 4;
      }

      if (hasBytes(4)) {
        this.seed = vi.getUint32(offset);
        offset += 4;
      }

      const ds: number[] = [];
      if (hasBytes(2)) {
        const dsLen = vi.getUint16(offset);
        offset += 2;
        for (let i = 0; i < dsLen && hasBytes(2); i++) {
          ds.push(vi.getInt16(offset));
          offset += 2;
        }
      }

      const cs: CallFrame[] = [];
      if (hasBytes(2)) {
        const csLen = vi.getUint16(offset);
        offset += 2;
        for (let i = 0; i < csLen && hasBytes(5); i++) {
          const framePc = vi.getUint32(offset);
          offset += 4;
          const localLen = vi.getUint8(offset);
          offset += 1;
          const local = new Int16Array(localLen);
          for (let j = 0; j < localLen && hasBytes(2); j++) {
            local[j] = vi.getInt16(offset);
            offset += 2;
          }
          let frameDsLen = 0;
          if (hasBytes(2)) {
            frameDsLen = vi.getUint16(offset);
            offset += 2;
          }
          const frameDs: number[] = [];
          for (let j = 0; j < frameDsLen && hasBytes(2); j++) {
            frameDs.push(vi.getInt16(offset));
            offset += 2;
          }
          cs.push({ pc: framePc, local, ds: frameDs });
        }
      }

      return { ds, cs, pc };
    } catch (err) {
      console.error('[ZMachine] Deserialize error:', err);
      return null;
    }
  }

  public *genPrint(text: string): Generator<any, void, any> {
    this.currentOutputBuffer += text;
  }

  public *updateStatusLine(location: string, v18: number, v17: number): Generator<any, void, any> {
    this.currentStatus = {
      location: location || 'Unknown',
      scoreOrHours: v18,
      movesOrMinutes: v17,
      statusType: this.statusType ? 'time' : 'score'
    };
  }

  public *save(buf: Uint8Array): Generator<any, boolean, any> {
    this.lastSavedBuffer = buf;
    return true;
  }

  public *restore(): Generator<any, Uint8Array | null, any> {
    return this.lastSavedBuffer;
  }

  public *read(maxlen: number): Generator<any, string, any> {
    yield { type: 'read', maxlen };
    return this.nextInputString;
  }

  public getSnapshot(): Uint8Array {
    return this.serialize(this.activeDs, this.activeCs, this.activePc);
  }

  public loadSnapshot(snapshotData: Uint8Array): boolean {
    const restored = this.deserialize(snapshotData);
    if (!restored) return false;
    this.activeDs = restored.ds;
    this.activeCs = restored.cs;
    this.activePc = restored.pc;
    this.gen = this.run(true);
    // Advance generator to the read yield point
    const step = this.gen.next();
    return !step.done;
  }

  /**
   * Main Z-machine execution generator.
   */
  public *run(resumeFromActiveState: boolean = false): Generator<any, void, any> {
    let mem = this.mem;
    let pc = 0;
    let cs: CallFrame[] = [];
    let ds: number[] = [];
    let op0 = 0,
      op1 = 0,
      op2 = 0,
      op3 = 0,
      opc = 0,
      inst = 0,
      x = 0;
    let globals = 0,
      objects = 0,
      fwords = 0,
      defprop = 0;

    const addr = (xVal: number) => (xVal & 65535) << 1;

    const fetch = (xVal: number): number => {
      if (xVal === 0) return ds.pop() || 0;
      if (xVal < 16) return cs[0].local[xVal - 1];
      return this.get(globals + 2 * xVal);
    };

    const flagset = () => {
      op3 = 1 << (15 & ~op1);
      op2 = objects + op0 * 9 + (op1 & 16 ? 2 : 0);
      opc = this.get(op2);
    };

    const initRng = () => {
      this.seed = (Math.random() * 0xffffffff) >>> 0;
    };

    const init = () => {
      mem = this.mem = new Uint8Array(this.memInit);
      this.view = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
      mem[1] &= 3;
      if (this.isTandy) mem[1] |= 8;
      this.put(16, this.savedFlags);
      if (!this.vocabulary) this.parseVocab(this.getu(8));
      defprop = this.getu(10) - 2;
      globals = this.getu(12) - 32;
      this.fwords = fwords = this.getu(24);
      cs = [];
      ds = [];
      pc = this.getu(6);
      objects = defprop + 55;
      initRng();
    };

    const move = (xObj: number, yObj: number) => {
      let wVal = 0,
        zVal = 0;
      if ((zVal = mem[objects + xObj * 9 + 4])) {
        if (mem[objects + zVal * 9 + 6] === xObj) {
          mem[objects + zVal * 9 + 6] = mem[objects + xObj * 9 + 5];
        } else {
          zVal = mem[objects + zVal * 9 + 6];
          while (zVal !== xObj) {
            wVal = zVal;
            zVal = mem[objects + zVal * 9 + 5];
          }
          mem[objects + wVal * 9 + 5] = mem[objects + xObj * 9 + 5];
        }
      }
      if ((mem[objects + xObj * 9 + 4] = yObj)) {
        mem[objects + xObj * 9 + 5] = mem[objects + yObj * 9 + 6];
        mem[objects + yObj * 9 + 6] = xObj;
      } else {
        mem[objects + xObj * 9 + 5] = 0;
      }
    };

    const pcget = (): number => {
      pc += 2;
      return this.get(pc - 2);
    };

    const pcgetb = (): number => mem[pc++];

    const pcfetch = (): number => fetch(mem[pc++]);

    const opfetch = (xMode: number, yNum: number): number | undefined => {
      if ((xMode &= 3) === 3) return;
      opc = yNum;
      return [pcget, pcgetb, pcfetch][xMode]();
    };

    const predicate = (p: boolean) => {
      let xBranch = pcgetb();
      if (xBranch & 128) p = !p;
      if (xBranch & 64) xBranch &= 63;
      else xBranch = ((xBranch & 63) << 8) | pcgetb();
      if (p) return;
      if (xBranch === 0 || xBranch === 1) return ret(xBranch);
      if (xBranch & 0x2000) xBranch -= 0x4000;
      pc += xBranch - 2;
    };

    const propfind = (): boolean => {
      let zAddr = this.getu(objects + op0 * 9 + 7);
      zAddr += mem[zAddr] * 2 + 1;
      while (mem[zAddr]) {
        if ((mem[zAddr] & 31) === op1) {
          op3 = zAddr + 1;
          return true;
        } else {
          zAddr += (mem[zAddr] >> 5) + 2;
        }
      }
      op3 = 0;
      return false;
    };

    const ret = (retVal: number) => {
      ds = cs[0].ds;
      pc = cs[0].pc;
      cs.shift();
      store(retVal);
    };

    const store = (yVal: number) => {
      const xTarget = pcgetb();
      if (xTarget === 0) ds.push(yVal);
      else if (xTarget < 16) cs[0].local[xTarget - 1] = yVal;
      else this.put(globals + 2 * xTarget, yVal);
    };

    const xfetch = (xVar: number): number => {
      if (xVar === 0) return ds[ds.length - 1];
      if (xVar < 16) return cs[0].local[xVar - 1];
      return this.get(globals + 2 * xVar);
    };

    const xstore = (xVar: number, yVal: number) => {
      if (xVar === 0) ds[ds.length - 1] = yVal;
      else if (xVar < 16) cs[0].local[xVar - 1] = yVal;
      else this.put(globals + 2 * xVar, yVal);
    };

    if (resumeFromActiveState) {
      mem = this.mem;
      this.view = new DataView(mem.buffer, mem.byteOffset, mem.byteLength);
      defprop = this.getu(10) - 2;
      globals = this.getu(12) - 32;
      this.fwords = fwords = this.getu(24);
      objects = defprop + 55;
      if (!this.vocabulary) this.parseVocab(this.getu(8));
      cs = this.activeCs;
      ds = this.activeDs;
      pc = this.activePc;
      if (!this.seed) initRng();
    } else {
      init();
    }

    // Main execution loop
    main: for (;;) {
      const instPc = pc;
      inst = pcgetb();
      if (inst < 128) {
        // 2OP
        if (inst & 64) op0 = pcfetch();
        else op0 = pcgetb();
        if (inst & 32) op1 = pcfetch();
        else op1 = pcgetb();
        inst &= 31;
        opc = 2;
      } else if (inst < 176) {
        // 1OP
        x = (inst >> 4) & 3;
        inst &= 143;
        if (x === 0) op0 = pcget();
        else if (x === 1) op0 = pcgetb();
        else if (x === 2) op0 = pcfetch();
      } else if (inst >= 192) {
        // EXT
        x = pcgetb();
        op0 = opfetch(x >> 6, 1) || 0;
        op1 = opfetch(x >> 4, 2) || 0;
        op2 = opfetch(x >> 2, 3) || 0;
        op3 = opfetch(x >> 0, 4) || 0;
        if (inst < 224) inst &= 31;
      }

      switch (inst) {
        case 1: // EQUAL?
          predicate(op0 === op1 || (opc > 2 && op0 === op2) || (opc === 4 && op0 === op3));
          break;
        case 2: // LESS?
          predicate(op0 < op1);
          break;
        case 3: // GRTR?
          predicate(op0 > op1);
          break;
        case 4: // DLESS?
          xstore(op0, (x = xfetch(op0) - 1));
          predicate(x < op1);
          break;
        case 5: // IGRTR?
          xstore(op0, (x = xfetch(op0) + 1));
          predicate(x > op1);
          break;
        case 6: // IN?
          predicate(mem[objects + op0 * 9 + 4] === op1);
          break;
        case 7: // BTST?
          predicate((op0 & op1) === op1);
          break;
        case 8: // BOR
          store(op0 | op1);
          break;
        case 9: // BAND
          store(op0 & op1);
          break;
        case 10: // FSET?
          flagset();
          predicate(!!(opc & op3));
          break;
        case 11: // FSET
          flagset();
          this.put(op2, opc | op3);
          break;
        case 12: // FCLEAR
          flagset();
          this.put(op2, opc & ~op3);
          break;
        case 13: // SET
          xstore(op0, op1);
          break;
        case 14: // MOVE
          move(op0, op1);
          break;
        case 15: // GET
          store(this.get((op0 + op1 * 2) & 65535));
          break;
        case 16: // GETB
          store(mem[(op0 + op1) & 65535]);
          break;
        case 17: // GETP
          if (propfind()) store(mem[op3 - 1] & 32 ? this.get(op3) : mem[op3]);
          else store(this.get(defprop + 2 * op1));
          break;
        case 18: // GETPT
          propfind();
          store(op3);
          break;
        case 19: // NEXTP
          x = this.getu(objects + op0 * 9 + 7);
          x += mem[x] * 2 + 1;
          if (op1 === 0) store(mem[x] & 31);
          else {
            propfind();
            if (op3) {
              x = op3 + (mem[op3 - 1] >> 5) + 1;
              store(mem[x] & 31);
            } else {
              store(0);
            }
          }
          break;
        case 20: // ADD
          store(op0 + op1);
          break;
        case 21: // SUB
          store(op0 - op1);
          break;
        case 22: // MUL
          store(Math.floor(op0 * op1));
          break;
        case 23: // DIV
          store(Math.floor(op0 / op1));
          break;
        case 24: // MOD
          store(op0 % op1);
          break;
        case 128: // ZERO?
          predicate(op0 === 0);
          break;
        case 129: // NEXT?
          x = mem[objects + op0 * 9 + 5];
          store(x);
          predicate(x !== 0);
          break;
        case 130: // FIRST?
          x = mem[objects + op0 * 9 + 6];
          store(x);
          predicate(x !== 0);
          break;
        case 131: // LOC
          store(mem[objects + op0 * 9 + 4]);
          break;
        case 132: // PTSIZE
          store((mem[op0 - 1] >> 5) + 1);
          break;
        case 133: // INC
          xstore(op0, xfetch(op0) + 1);
          break;
        case 134: // DEC
          xstore(op0, xfetch(op0) - 1);
          break;
        case 135: // PRINTB
          yield* this.genPrint(this.getText(op0));
          break;
        case 137: // REMOVE
          move(op0, 0);
          break;
        case 138: // PRINTD
          yield* this.genPrint(this.getText(this.getu(objects + op0 * 9 + 7) + 1));
          break;
        case 139: // RETURN
          ret(op0);
          break;
        case 140: // JUMP
          pc += op0 - 2;
          break;
        case 141: // PRINT
          yield* this.genPrint(this.getText(addr(op0)));
          break;
        case 142: // VALUE
          store(xfetch(op0));
          break;
        case 143: // BCOM
          store(~op0);
          break;
        case 176: // RTRUE
          ret(1);
          break;
        case 177: // RFALSE
          ret(0);
          break;
        case 178: // PRINTI
          yield* this.genPrint(this.getText(pc));
          pc = this.endText;
          break;
        case 179: // PRINTR
          yield* this.genPrint(this.getText(pc) + '\n');
          ret(1);
          break;
        case 180: // NOOP
          break;
        case 181: // SAVE
          this.savedFlags = this.get(16);
          predicate(yield* this.save(this.serialize(ds, cs, instPc)));
          break;
        case 182: { // RESTORE
          this.savedFlags = this.get(16);
          let zBuf: Uint8Array | null = yield* this.restore();
          let zState = zBuf ? this.deserialize(zBuf) : null;
          this.put(16, this.savedFlags);
          if (zState) {
            ds = zState.ds;
            cs = zState.cs;
            pc = zState.pc;
          }
          predicate(!!zState);
          break;
        }
        case 183: // RESTART
          init();
          break;
        case 184: // RSTACK
          ret(ds[ds.length - 1]);
          break;
        case 185: // FSTACK
          ds.pop();
          break;
        case 186: // QUIT
          this.activePc = instPc;
          this.activeCs = cs;
          this.activeDs = ds;
          return;
        case 187: // CRLF
          yield* this.genPrint('\n');
          break;
        case 188: // USL
          yield* this.updateStatusLine(
            this.getText(this.getu(objects + xfetch(16) * 9 + 7) + 1),
            xfetch(18),
            xfetch(17)
          );
          break;
        case 189: // VERIFY
          predicate(true);
          break;
        case 224: // CALL
          if (op0) {
            x = mem[(op0 = addr(op0))];
            cs.unshift({ ds: ds, pc: pc, local: new Int16Array(x) });
            ds = [];
            pc = op0 + 1;
            for (x = 0; x < mem[op0]; x++) cs[0].local[x] = pcget();
            if (opc > 1 && mem[op0] > 0) cs[0].local[0] = op1;
            if (opc > 2 && mem[op0] > 1) cs[0].local[1] = op2;
            if (opc > 3 && mem[op0] > 2) cs[0].local[2] = op3;
          } else {
            store(0);
          }
          break;
        case 225: // PUT
          this.put((op0 + op1 * 2) & 65535, op2);
          break;
        case 226: // PUTB
          mem[(op0 + op1) & 65535] = op2;
          break;
        case 227: // PUTP
          propfind();
          if (mem[op3 - 1] & 32) this.put(op3, op2);
          else mem[op3] = op2;
          break;
        case 228: { // READ
          yield* this.genPrint('');
          yield* this.updateStatusLine(
            this.getText(this.getu(objects + xfetch(16) * 9 + 7) + 1),
            xfetch(18),
            xfetch(17)
          );
          this.activePc = instPc;
          this.activeCs = cs;
          this.activeDs = ds;
          const userInput: string = yield* this.read(mem[op0 & 65535]);
          this.handleInput(userInput, op0 & 65535, op1 & 65535);
          break;
        }
        case 229: // PRINTC
          yield* this.genPrint(op0 === 13 ? '\n' : op0 ? String.fromCharCode(op0) : '');
          break;
        case 230: // PRINTN
          yield* this.genPrint(String(op0));
          break;
        case 231: // RANDOM
          if (op0 <= 0) {
            if (op0 === 0) {
              initRng();
            } else {
              this.seed = op0 >>> 0;
            }
            store(0);
            break;
          }
          this.seed = (1664525 * this.seed + 1013904223) >>> 0;
          store(Math.floor((this.seed / 0xffffffff) * op0) + 1);
          break;
        case 232: // PUSH
          ds.push(op0);
          break;
        case 233: // POP
          xstore(op0, ds.pop() || 0);
          break;
        default:
          throw new Error(`Invalid Z-machine opcode: ${inst}`);
      }
    }
  }

  /**
   * Starts or resumes the engine until the first input prompt.
   */
  public start(): ZExecutionResult {
    this.currentOutputBuffer = '';
    this.gen = this.run(false);
    const step = this.gen.next();
    return {
      output: this.currentOutputBuffer,
      isWaitingForInput: !step.done,
      isGameOver: !!step.done,
      status: { ...this.currentStatus }
    };
  }

  /**
   * Resumes execution with a user command string until the next input prompt.
   */
  public sendCommand(cmd: string): ZExecutionResult {
    this.currentOutputBuffer = '';
    this.nextInputString = cmd;

    if (!this.gen) {
      throw new Error('ZMachine engine is not running');
    }

    const step = this.gen.next();
    return {
      output: this.currentOutputBuffer,
      isWaitingForInput: !step.done,
      isGameOver: !!step.done,
      status: { ...this.currentStatus }
    };
  }
}
