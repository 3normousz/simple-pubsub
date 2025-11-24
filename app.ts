// interfaces
interface IEvent {
  type(): string;
  machineId(): string;
}

interface ISubscriber {
  handle(event: IEvent): void;
}

interface IPublishSubscribeService {
  publish (event: IEvent): void;
  subscribe (type: string, handler: ISubscriber): void;
  unsubscribe (type: string, handler: ISubscriber): void;
}


// implementations
class MachineSaleEvent implements IEvent {
  constructor(private readonly _sold: number, private readonly _machineId: string) {}

  machineId(): string {
    return this._machineId;
  }

  getSoldQuantity(): number {
    return this._sold;
  }

  type(): string {
    return 'sale';
  }
}

class MachineRefillEvent implements IEvent {
  constructor(private readonly _refill: number, private readonly _machineId: string) {}

  machineId(): string {
    return this._machineId;
  }

  getRefillQuantity(): number {
    return this._refill;
  }

  type(): string {
    return "refill";
  }
}

class LowStockWarningEvent implements IEvent {
  constructor(private readonly _machineId: string) {}

  type(): string {
    return "low-stock";
  }

  machineId(): string {
    return this._machineId;
  }
}

class StockLevelOkEvent implements IEvent {
  constructor(private readonly _machineId: string) {}
  type(): string {
    return "stock-ok";
  }
  machineId(): string {
    return this._machineId;
  }
}

class MachineSaleSubscriber implements ISubscriber {
  public machines: Machine[];

  constructor (machines: Machine[]) {
    this.machines = machines;
  }

  handle(event: IEvent): void {
    if (event.type() !== "sale") return;
    const saleEvent = event as MachineSaleEvent;
    const targetMachine = this.machines.find((m) => m.id === saleEvent.machineId());
    if (!targetMachine) return;
    targetMachine.stockLevel -= saleEvent.getSoldQuantity();
  }
}

class MachineRefillSubscriber implements ISubscriber {
  public machines: Machine[];

  constructor(machines: Machine[]) {
    this.machines = machines;
  }

  handle(event: IEvent): void {
    if (event.type() !== "refill") return;
    const refillEvent = event as MachineRefillEvent;
    const targetMachine = this.machines.find((m) => m.id === refillEvent.machineId());
    if (!targetMachine) return;
    targetMachine.stockLevel += refillEvent.getRefillQuantity();
  }
}


// objects
class Machine {
  public stockLevel = 10;
  public id: string;

  constructor (id: string) {
    this.id = id;
  }
}

class PublishSubscribeService implements IPublishSubscribeService {
  private readonly subscribers: Map<string, ISubscriber[]> = new Map();
  private readonly queue: IEvent[] = [];
  private processing = false;

  subscribe(type: string, handler: ISubscriber): void {
    const list = this.subscribers.get(type) ?? [];
    list.push(handler);
    this.subscribers.set(type, list);
  }

  publish(event: IEvent): void {
    this.queue.push(event);
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift()!;
        const list = this.subscribers.get(next.type());
        if (!list || list.length === 0) continue;
        for (const sub of [...list]) {
          try {
            sub.handle(next);
          } catch {

          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  unsubscribe(type: string, handler: ISubscriber): void {
    const list = this.subscribers.get(type);
    if (!list) return;
    const filtered = list.filter((h) => h !== handler);
    if (filtered.length === 0) {
      this.subscribers.delete(type);
    } else {
      this.subscribers.set(type, filtered);
    }
  }
}

class StockWarningSubscriber implements ISubscriber {
  private below: Set<string>;
  constructor(
    private readonly targetMachines: Machine[],
    private readonly pubSubService: IPublishSubscribeService,
    private readonly threshold: number = 3
  ) {
    this.below = new Set(
      this.targetMachines
        .filter((m) => m.stockLevel < this.threshold)
        .map((m) => m.id)
    );
  }

  handle(event: IEvent): void {
    if (event.type() !== 'sale' && event.type() !== 'refill') return;
    const machine = this.targetMachines.find((m) => m.id === event.machineId());
    if (!machine) return;
    const isBelow = machine.stockLevel < this.threshold;
    const wasBelow = this.below.has(machine.id);
    if (isBelow && !wasBelow) {
      this.below.add(machine.id);
      this.pubSubService.publish(new LowStockWarningEvent(machine.id));
    } else if (!isBelow && wasBelow) {
      this.below.delete(machine.id);
      this.pubSubService.publish(new StockLevelOkEvent(machine.id));
    }
  }
}

class StockAlertLogger implements ISubscriber {
  handle(event: IEvent): void {
    if (event.type() === "low-stock") {
      console.log(`LOW STOCK WARNING for machine ID: ${event.machineId()}`);
    } else if (event.type() === "stock-ok") {
      console.log(`STOCK LEVEL OK for machine ID: ${event.machineId()}`);
    }
  }
}

// helpers
const randomMachine = (): string => {
  const random = Math.random() * 3;
  if (random < 1) {
    return '001';
  } else if (random < 2) {
    return '002';
  }
  return '003';

}

const eventGenerator = (): IEvent => {
  const random = Math.random();
  if (random < 0.5) {
    const saleQty = Math.random() < 0.5 ? 1 : 2; // 1 or 2
    return new MachineSaleEvent(saleQty, randomMachine());
  }
  const refillQty = Math.random() < 0.5 ? 3 : 5; // 3 or 5
  return new MachineRefillEvent(refillQty, randomMachine());
}


// program
(async () => {
  // create 3 machines with a quantity of 10 stock
  const machines: Machine[] = [ new Machine('001'), new Machine('002'), new Machine('003') ];

  // create a machine sale event subscriber. inject the machines (all subscribers should do this)
  const saleSubscriber = new MachineSaleSubscriber(machines);
  const refillSubscriber = new MachineRefillSubscriber(machines);

  // create the PubSub service
  const pubSubService: IPublishSubscribeService = new PublishSubscribeService();

  // subscribe event handlers
  pubSubService.subscribe("sale", saleSubscriber);
  pubSubService.subscribe("refill", refillSubscriber);
  // subscribe stock level warning 
  const stockWarning = new StockWarningSubscriber(machines, pubSubService);
  pubSubService.subscribe("sale", stockWarning);
  pubSubService.subscribe("refill", stockWarning);
  // subscribe alert logger
  const alertLogger = new StockAlertLogger();
  pubSubService.subscribe("low-stock", alertLogger);
  pubSubService.subscribe("stock-ok", alertLogger);

  const args = process.argv.slice(2);

  if (args.includes('--test')) {
    // Predefined seq
    const sequence: IEvent[] = [
      new MachineSaleEvent(2, '001'), // 10 -> 8
      new MachineSaleEvent(2, '001'), // 8 -> 6
      new MachineSaleEvent(2, '001'), // 6 -> 4
      new MachineSaleEvent(2, '001'), // 4 -> 2 should trigger low-stock alert
      new MachineRefillEvent(3, '001') // 2 -> 5 should trigger stock-ok alert
    ];
    sequence.forEach(e => pubSubService.publish(e));
    console.log('Machine 001 stock:', machines.find(m => m.id==='001')?.stockLevel); // Should be 5
  } else {
    // Random seq

    // create 5 random events
    const events = [1, 2, 3, 4, 5].map(i => eventGenerator());
    // publish the events
    events.forEach((e) => pubSubService.publish(e));
    // show final stock levels
    console.log(
      "Stock levels: ",
      machines.map((m) => ({ id: m.id, stock: m.stockLevel }))
    );
  }
})();
