let SerialPort = require('serialport');
let Packet = require('./packet');
let constants = require('./const');
const EventEmitter = require('events');

class Velbus extends EventEmitter {


	portString = "";
	port = null;
	buttonNames = [];

	/**
	 *
	 */
	constructor(velbusModule) {
		super();
		global.velbus = this;
		this.modules = [];

		if (!this.port) {
			SerialPort.list((err, ports) => {
				//find a Velleman USB module
				ports.forEach(port => {
					if (port.manufacturer && port.manufacturer.toLowerCase().indexOf("velleman") > -1) {
						console.info("FYI: Port found made by Velleman: " + port.comName);
						this.portString = port.comName;
						this.init();
					}
				});
				console.warn("No Velbus port found ...");
			});
		}

	}


	init() {


		this.port = new SerialPort(this.portString, {
			baudRate: 38400,
			autoOpen: false
		});


		// open errors will be emitted as an error event
		this.port.on('error', err => {
			console.warn('Velbus: Serial ERROR :: ', err);
			//RED.notify(err, "error");
			this.emit("onSerialError", err);

			this.iid = setTimeout(() => this.tryReconnect(), 5000);
		});

		this.port.on('close', msg => {
			console.warn('Velbus: Serial got closed :: ', msg);
			this.emit("onSerialError", msg);
			this.iid = setTimeout(() => this.tryReconnect(), 3000);
		});

		this.port.on('data', data => {
			let packet = new Packet();
			packet.setRawBytesAndPack(data);

			//console.log("packet", data);

			//console.info(`cmd ${packet.command} @ ${packet.address} - ${packet.toString()}`);


			if (packet.command === constants.COMMAND_MODULE_NAME_PART1) {
				this.setPartName(0, packet);
			} else if (packet.command === constants.COMMAND_MODULE_NAME_PART2) {
				const databytes = packet.getDataBytes();
				if (databytes[1] === Math.pow(2, this.channel - 1)) {
					this.setPartName(1, databytes);
				}
			} else if (packet.command === constants.COMMAND_MODULE_NAME_PART3) {
				const databytes = packet.getDataBytes();
				if (databytes[1] === Math.pow(2, this.channel - 1)) {
					this.setPartName(2, databytes);
				}
			} else if (packet.command === constants.COMMAND_MODULE_TYPE) {
				let moduleName = constants.moduleNames["module" + packet.dec2hex(packet.getDataByte(1))];
				console.info(`Module ${moduleName} found @ ${packet.dec2hex(packet.address)}`);
				this.modules.push({name: moduleName, address: packet.address});

			}


			this.emit("onSerialPacket", packet);


		});

		this.port.open();

		//this.scan();

	}

	tryReconnect() {
		clearTimeout(this.iid);

		this.port.open();
		this.velbusConfigNode.events.emit("onReconnecting");
	}


	/**
	 * Scan the bus for Velbus modules
	 */
	scan() {
		this.modules = [];
		for (let addr = 1; addr < 200; addr++) {
			setTimeout(() => {
				let getModule = new Packet();
				getModule.setRawBytesAndPack([Packet.STX, Packet.PRIORITY_LOW, addr, 0X40, 0X00, Packet.ETX]);
				//console.log("getModule data: ", getModule.toString());
				this.port.write(getModule.getRawBuffer());
			}, 1000 + addr * 100);

		}

	}

	close() {
		this.port.close();
	}

	requestButtonName(address, channel) {
		let getModuleLabel = new Packet(address, Packet.PRIORITY_LOW,
				[constants.COMMAND_MODULE_NAME_REQUEST, Math.pow(2, channel - 1)], false);
		this.port.write(getModuleLabel.getRawBuffer());

	}

	setPartName(index, packet) {

		//if (databytes[3] === 255) return;
		const databytes = packet.getDataBytes();
		const channel = this.channelFromByte(databytes[1]);

		if (!this.buttonNames[packet.address]) {
			this.buttonNames[packet.address] = [];
		}
		if (!this.buttonNames[packet.address][channel]) {
			this.buttonNames[packet.address][channel] = [];
		}

		this.buttonNames[packet.address][channel][index] = "";
		for (let i = 2; i < databytes.length; i++) {
			if (databytes[i] !== 255) {
				console.log("char", databytes[i], String.fromCharCode(databytes[i]));
				this.buttonNames[packet.address][channel][index] += String.fromCharCode(databytes[i]);
			}
		}
		if (this.buttonNames[packet.address][channel].length === 3) {
			this.emit("onButtonName", packet.address, channel, this.buttonNames[packet.address][channel].join(""));
		}

		this.velbusName =
				console.log("NAME::: ", this.velbusName);
		this.status({fill: "green", shape: "ring", text: this.velbusName});


	}

	channelFromByte(byte) {
		const byteString = byte.toString(2);
		let channel = 1;
		let i = byteString.length - 1;
		while (byteString[i] === "0") {
			i--;
			channel++;
		}
		return channel;
	}
}

module.exports = Velbus;



