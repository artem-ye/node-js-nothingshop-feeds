class ModelProduct {

    ////////////////////////////////////////////////////////////////
    // INITIALIZATION
    ////////////////////////////////////////////////////////////////

    constructor() {

        this._init();

    }

    _init() {

        this.productKeyField = 'id';
        this.productProps = {
            id: '',
            sku: '',
            title: '',
            description: '',
            vendor: '',
            weight: 0,
            material: '',
            wash: ''
        };
    }

    clear() {
        this._init();
    }

    ////////////////////////////////////////////////////////////////
    // COMPARE
    ////////////////////////////////////////////////////////////////

    isEqual(paramProductProps) {

        for(let [propName, propVal] of Object.entries(this.productProps)) {

            // skip id
            if (propName == this.productKeyField)
                continue;

            if (paramProductProps.hasOwnProperty(propName)) {

                if (propVal != paramProductProps[propName]) {
                    return false;
                }
            }

        }

        return true;
    }

    ////////////////////////////////////////////////////////////////
    // GETTERS
    ////////////////////////////////////////////////////////////////

    getProduct = () => {return this.productProps};

    id = () => {return this.productProps[this.productKeyField]}

    ////////////////////////////////////////////////////////////////
    // SETTERS
    ////////////////////////////////////////////////////////////////

    mapProductProps(objProductAttributes, objFieldAccord) {

        for(let [classPropName, accordPropName] of Object.entries(objFieldAccord)) {
            this.setProductProperty(classPropName, objProductAttributes[accordPropName]);
        }

    }

    setProduct(objProductAttributes) {

        for(let [propName, propVal] of Object.entries(objProductAttributes)) {
            setProductProperty(propName, propVal);
        }

    }

    setProductProperty(name, value) {

        if (this.productProps.hasOwnProperty(name)) {

            if (name == 'title')
                this.productProps[name] = value.slice(0, 254);
            else
                this.productProps[name] = value;
        }
        else
            throw new Error("Invalid product property " +  name);

    }

}

module.exports.ModelProduct = ModelProduct;